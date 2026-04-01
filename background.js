// CRMChat Translator - Service Worker (Background)
// Routes translation requests through the Cloudflare Worker proxy

const TRANSLATE_API = 'https://crmchat-translate.crmchat-translate.workers.dev/translate';

// Default settings (no API key needed — proxy handles it)
const DEFAULT_SETTINGS = {
  targetLanguage: 'en',
  outboundLanguage: 'ru',
  autoTranslateInbound: true,
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

    const targetLang = message.direction === 'outbound'
      ? settings.outboundLanguage
      : settings.targetLanguage;

    const result = await translateText(message.text, targetLang);
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
