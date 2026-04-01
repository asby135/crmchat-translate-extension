// CRMChat Translator - Service Worker (Background)
// Routes outbound translation requests through the Cloudflare Worker proxy

const TRANSLATE_API = 'https://crmchat-translate.crmchat-translate.workers.dev/translate';

// Default settings
const DEFAULT_SETTINGS = {
  outboundLanguage: 'ru',
  enabled: true,
};

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

async function translateText(text, targetLang) {
  if (!text || !text.trim()) {
    return { translatedText: text, detectedLanguage: '' };
  }

  const response = await fetch(TRANSLATE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, targetLanguage: targetLang }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `Translation error: ${response.status}`);
  }

  return response.json();
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'translate') {
    handleTranslate(message, sendResponse);
    return true;
  }

  if (message.type === 'getSettings') {
    getSettings().then(sendResponse);
    return true;
  }

  if (message.type === 'saveSettings') {
    chrome.storage.sync.set(message.settings).then(() => {
      sendResponse({ success: true });
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'settingsUpdated',
            settings: message.settings,
          }).catch(() => {});
        }
      });
    });
    return true;
  }
});

async function handleTranslate(message, sendResponse) {
  try {
    const settings = await getSettings();

    if (!settings.enabled) {
      sendResponse({ error: 'Translation is disabled' });
      return;
    }

    const result = await translateText(message.text, settings.outboundLanguage);
    sendResponse(result);
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

// On install, open popup so user can configure language preferences
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }
});
