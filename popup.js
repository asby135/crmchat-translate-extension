// CRMChat Translator - Popup Script

const FIELDS = ['apiKey', 'targetLanguage', 'outboundLanguage'];
const TOGGLES = ['enabled', 'autoTranslateInbound'];

const statusEl = document.getElementById('status');

// Load settings on popup open
chrome.runtime.sendMessage({ type: 'getSettings' }, (settings) => {
  if (!settings) return;

  for (const field of FIELDS) {
    const el = document.getElementById(field);
    if (el) el.value = settings[field] || '';
  }

  for (const toggle of TOGGLES) {
    const el = document.getElementById(toggle);
    if (el) el.checked = settings[toggle] !== false;
  }
});

// Save on any change
function saveSettings() {
  const settings = {};

  for (const field of FIELDS) {
    const el = document.getElementById(field);
    if (el) settings[field] = el.value;
  }

  for (const toggle of TOGGLES) {
    const el = document.getElementById(toggle);
    if (el) settings[toggle] = el.checked;
  }

  chrome.runtime.sendMessage({ type: 'saveSettings', settings }, (response) => {
    if (response?.success) {
      statusEl.textContent = 'Settings saved';
      statusEl.className = 'status success';
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'status';
      }, 2000);
    }
  });
}

// Bind change events
for (const field of FIELDS) {
  const el = document.getElementById(field);
  if (el) el.addEventListener('change', saveSettings);
}

for (const toggle of TOGGLES) {
  const el = document.getElementById(toggle);
  if (el) el.addEventListener('change', saveSettings);
}

// Save API key on blur too (for typing)
const apiKeyEl = document.getElementById('apiKey');
if (apiKeyEl) {
  apiKeyEl.addEventListener('blur', saveSettings);
}
