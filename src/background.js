// src/background.js
let creatingOffscreen;

// Ensure the offscreen document exists
async function setupOffscreenDocument(path) {
  const offscreenUrl = chrome.runtime.getURL(path);

  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  // Prevent multiple creations
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: path,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Running local AI model inference and synthesizing real-time ambient piano audio.'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

// Handle messages from content script and forward to offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TELEMETRY_UPDATE') {
    // Ensure the offscreen document is ready before sending
    setupOffscreenDocument('src/offscreen.html').then(() => {
      chrome.runtime.sendMessage({
        type: 'ENGINE_UPDATE',
        metrics: message.metrics
      });
    }).catch(e => console.error("Error setting up offscreen document:", e));
  }

  if (message.type === 'TOGGLE_EXTENSION') {
    // Set state
    chrome.storage.local.set({ isTypeMaestroEnabled: message.enabled });

    setupOffscreenDocument('src/offscreen.html').then(() => {
      chrome.runtime.sendMessage({
        type: 'ENGINE_TOGGLE',
        enabled: message.enabled
      });
    }).catch(e => console.error("Error setting up offscreen document:", e));
  }

  if (message.type === 'UPDATE_PRESET' || message.type === 'UPDATE_VOLUME') {
    setupOffscreenDocument('src/offscreen.html').then(() => {
      chrome.runtime.sendMessage(message);
    });
  }

  // Let popup know if we handled it immediately (not strictly required for one-way flows)
  return false;
});

// Setup on extension load
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isTypeMaestroEnabled: true,
    currentPreset: 'Deep Focus',
    masterVolume: 0.5
  });
  setupOffscreenDocument('src/offscreen.html');
});

// Also setup on startup
chrome.runtime.onStartup.addListener(() => {
  setupOffscreenDocument('src/offscreen.html');
});
