// CRMChat Translator - Service Worker (Background)
// Handles translation API calls from content scripts

const GOOGLE_TRANSLATE_API = 'https://translation.googleapis.com/language/translate/v2';

// Default settings
const DEFAULT_SETTINGS = {
  apiKey: '',
  targetLanguage: 'en',
  outboundLanguage: 'ru',
  autoTranslateInbound: true,
  enabled: true,
};

// Get settings from storage
async function getSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return result;
}

// Translate text using Google Cloud Translation API
async function translateText(text, targetLang, apiKey) {
  if (!text || !text.trim()) {
    return { translatedText: text, detectedLanguage: '' };
  }

  if (!apiKey) {
    throw new Error('API key not configured. Open extension settings to add your Google Cloud Translation API key.');
  }

  const response = await fetch(`${GOOGLE_TRANSLATE_API}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      target: targetLang,
      format: 'text',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || `Translation API error: ${response.status}`);
  }

  const data = await response.json();
  const translation = data.data.translations[0];

  return {
    translatedText: translation.translatedText,
    detectedLanguage: translation.detectedSourceLanguage || '',
  };
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'translate') {
    handleTranslate(message, sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'getSettings') {
    getSettings().then(sendResponse);
    return true;
  }

  if (message.type === 'saveSettings') {
    chrome.storage.sync.set(message.settings).then(() => {
      sendResponse({ success: true });
      // Notify all content scripts of settings change
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

    const result = await translateText(message.text, targetLang, settings.apiKey);
    sendResponse(result);
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

// On install, open options
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.action.openPopup?.() || chrome.runtime.openOptionsPage?.();
  }
});
