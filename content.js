// CRMChat Translator - Content Script
// Injected into Telegram Web Client iframe on app.crmchat.ai

(() => {
  // Avoid double injection
  if (window.__crmTranslateLoaded) return;
  window.__crmTranslateLoaded = true;

  // ── Selectors ──────────────────────────────────────────────
  const SEL = {
    messageTextContent: '.text-content',
    messageTextInner: '.text-content-inner',
    messageWrapper: '.message-content-wrapper',
    messageList: '.MessageList',
    composer: '#editable-message-text',
    composerWrapper: '.message-input-wrapper',
    mainButton: '.main-button',
  };

  // ── State ──────────────────────────────────────────────────
  let settings = {
    targetLanguage: 'en',
    outboundLanguage: 'ru',
    autoTranslateInbound: true,
    enabled: true,
  };

  const translatedMessages = new WeakSet();
  let translateButton = null;

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    // Load settings
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getSettings' });
      if (response) settings = { ...settings, ...response };
    } catch (e) {
      console.warn('[CRMChat Translate] Could not load settings:', e.message);
    }

    // Wait for DOM to be ready with message list
    await waitForElement(SEL.messageList, 15000);

    // Start observing messages
    observeMessages();

    // Set up composer translate button
    setupComposerButton();

    // Translate existing visible messages
    if (settings.autoTranslateInbound && settings.enabled) {
      translateVisibleMessages();
    }

    console.info('[CRMChat Translate] Initialized');
  }

  // ── Inbound Translation ────────────────────────────────────

  function observeMessages() {
    const observer = new MutationObserver((mutations) => {
      if (!settings.enabled || !settings.autoTranslateInbound) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          // Check if the added node contains message text
          const textElements = node.matches?.(SEL.messageTextContent)
            ? [node]
            : Array.from(node.querySelectorAll(SEL.messageTextContent));

          for (const textEl of textElements) {
            translateMessageElement(textEl);
          }
        }
      }
    });

    // Scope to MessageList for performance; fall back to body for chat switches
    const messageList = document.querySelector(SEL.messageList);
    const target = messageList || document.body;
    observer.observe(target, {
      childList: true,
      subtree: true,
    });

    // If scoped to a MessageList, also watch body for chat switches that replace the list
    if (messageList) {
      const chatSwitchObserver = new MutationObserver(() => {
        const newList = document.querySelector(SEL.messageList);
        if (newList && newList !== messageList) {
          observer.disconnect();
          chatSwitchObserver.disconnect();
          observeMessages(); // Re-attach to the new MessageList
          if (settings.autoTranslateInbound && settings.enabled) {
            translateVisibleMessages();
          }
        }
      });
      chatSwitchObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function translateVisibleMessages() {
    const messages = document.querySelectorAll(SEL.messageTextContent);
    for (const msg of messages) {
      translateMessageElement(msg);
    }
  }

  async function translateMessageElement(element) {
    if (translatedMessages.has(element)) return;
    if (element.querySelector('.crm-translation')) return;
    translatedMessages.add(element);

    // Get the text content from the inner span or the element itself
    const innerSpan = element.querySelector(SEL.messageTextInner);
    const textSource = innerSpan || element;
    const originalText = textSource.textContent?.trim();

    if (!originalText || originalText.length < 2) return;

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'translate',
        text: originalText,
        direction: 'inbound',
      });

      if (result.error) {
        console.warn('[CRMChat Translate] Translation error:', result.error);
        return;
      }

      // Skip if the detected source language matches the target (already in the right language)
      if (result.detectedLanguage === settings.targetLanguage) return;

      if (!result.translatedText || result.translatedText === originalText) return;

      // Inject translation below the original text
      const translationEl = document.createElement('div');
      translationEl.className = 'crm-translation';
      translationEl.textContent = result.translatedText;
      translationEl.title = 'Translated by CRMChat';

      element.appendChild(translationEl);
    } catch (e) {
      console.warn('[CRMChat Translate] Failed to translate:', e.message);
    }
  }

  // ── Outbound Translation ───────────────────────────────────

  function setupComposerButton() {
    // Watch for composer appearing/disappearing (chat switches)
    const composerObserver = new MutationObserver(() => {
      const composerWrapper = document.querySelector(SEL.composerWrapper);
      if (composerWrapper && !document.querySelector('.crm-translate-btn')) {
        injectTranslateButton(composerWrapper);
      }
    });

    composerObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also try immediately
    const composerWrapper = document.querySelector(SEL.composerWrapper);
    if (composerWrapper) {
      injectTranslateButton(composerWrapper);
    }
  }

  function injectTranslateButton(composerWrapper) {
    if (document.querySelector('.crm-translate-btn')) return;

    translateButton = document.createElement('button');
    translateButton.className = 'crm-translate-btn';
    translateButton.title = `Translate to ${getLanguageName(settings.outboundLanguage)}`;
    translateButton.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
    `;

    translateButton.addEventListener('click', handleTranslateOutbound);

    // Insert the button before the main send button area
    const mainButton = composerWrapper.closest('.Composer')?.querySelector(SEL.mainButton);
    if (mainButton) {
      mainButton.parentElement.insertBefore(translateButton, mainButton);
    } else {
      // Fallback: append to the composer wrapper
      composerWrapper.appendChild(translateButton);
    }
  }

  async function handleTranslateOutbound() {
    const composer = document.querySelector(SEL.composer);
    if (!composer) return;

    const originalText = composer.textContent?.trim();
    if (!originalText) return;

    // Disable button during translation
    translateButton.classList.add('loading');
    translateButton.disabled = true;

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'translate',
        text: originalText,
        direction: 'outbound',
      });

      if (result.error) {
        console.warn('[CRMChat Translate] Outbound translation error:', result.error);
        showToast('Translation failed. Please try again later.');
        return;
      }

      if (!result.translatedText) {
        showToast('Translation returned empty result');
        return;
      }

      // Replace composer content with translated text
      replaceComposerText(composer, result.translatedText);

    } catch (e) {
      console.warn('[CRMChat Translate] Outbound translation error:', e.message);
      showToast('Translation failed. Check your connection and try again.');
    } finally {
      translateButton.classList.remove('loading');
      translateButton.disabled = false;
    }
  }

  function replaceComposerText(composer, newText) {
    // Focus the composer
    composer.focus();

    // Select all content
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    selection.removeAllRanges();
    selection.addRange(range);

    // Use execCommand to replace (preserves undo history and triggers input events)
    const success = document.execCommand('insertText', false, newText);

    if (!success) {
      // Fallback: direct DOM manipulation + dispatch input event
      composer.textContent = newText;
      composer.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: newText,
      }));
    }

    // Move cursor to end
    const endRange = document.createRange();
    endRange.selectNodeContents(composer);
    endRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(endRange);
  }

  // ── Utilities ──────────────────────────────────────────────

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        // Resolve anyway, the element might appear later
        resolve(null);
      }, timeout);
    });
  }

  function showToast(message) {
    const existing = document.querySelector('.crm-translate-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'crm-translate-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function getLanguageName(code) {
    const names = {
      en: 'English', ru: 'Russian', es: 'Spanish', fr: 'French',
      de: 'German', it: 'Italian', pt: 'Portuguese', zh: 'Chinese',
      ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi',
      tr: 'Turkish', uk: 'Ukrainian', pl: 'Polish', nl: 'Dutch',
    };
    return names[code] || code.toUpperCase();
  }

  // ── Settings Updates ───────────────────────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'settingsUpdated') {
      settings = { ...settings, ...message.settings };

      // Update translate button tooltip
      if (translateButton) {
        translateButton.title = `Translate to ${getLanguageName(settings.outboundLanguage)}`;
      }

      // Re-translate visible messages if auto-translate was just enabled
      if (settings.autoTranslateInbound && settings.enabled) {
        translateVisibleMessages();
      }
    }
  });

  // ── Start ──────────────────────────────────────────────────
  init();
})();
