// src/background.js
let creatingOffscreen;
let offscreenCreated = false;

// Ensure the offscreen document exists
async function setupOffscreenDocument(path) {
  if (offscreenCreated) return;
  const offscreenUrl = chrome.runtime.getURL(path);

  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    offscreenCreated = true;
    return;
  }

  // Prevent multiple creations
  if (creatingOffscreen) {
    await creatingOffscreen;
    offscreenCreated = true;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: path,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Synthesizing real-time ambient piano audio.'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
  offscreenCreated = true;
}

// Immediate top-level initialization
setupOffscreenDocument('src/offscreen.html');

// Handle messages from content script and forward to offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_INITIAL_STATE') {
    chrome.storage.local.get([
      'isTypeMaestroEnabled',
      'isKeyTonesEnabled',
      'isAmbientEnabled',
      'currentPreset',
      'currentInstrument',
      'masterVolume',
      'keystrokeVolume',
      'ambientVolume'
    ], (result) => {
      sendResponse({
        isTypeMaestroEnabled: result.isTypeMaestroEnabled !== undefined ? result.isTypeMaestroEnabled : true,
        isKeyTonesEnabled: result.isKeyTonesEnabled !== undefined ? result.isKeyTonesEnabled : true,
        isAmbientEnabled: result.isAmbientEnabled !== undefined ? result.isAmbientEnabled : false,
        currentPreset: result.currentPreset || 'Deep Focus',
        currentInstrument: result.currentInstrument || 'Grand Piano',
        masterVolume: result.masterVolume !== undefined ? result.masterVolume : 0.8,
        keystrokeVolume: result.keystrokeVolume !== undefined ? result.keystrokeVolume : 0.8,
        ambientVolume: result.ambientVolume !== undefined ? result.ambientVolume : 0.3
      });
    });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'TELEMETRY_UPDATE') {
    chrome.runtime.sendMessage({
      type: 'ENGINE_UPDATE',
      metrics: message.metrics
    }).catch(() => {});
  }

  if (message.type === 'TOGGLE_EXTENSION') {
    chrome.storage.local.set({ isTypeMaestroEnabled: message.enabled });
    setupOffscreenDocument('src/offscreen.html').then(() => {
      chrome.runtime.sendMessage({
        type: 'ENGINE_TOGGLE',
        enabled: message.enabled
      });
    }).catch(e => console.error("Error setting up offscreen document:", e));
  }

  if (message.type === 'TOGGLE_KEY_TONES') {
    chrome.storage.local.set({ isKeyTonesEnabled: message.enabled });
    setupOffscreenDocument('src/offscreen.html').then(() => {
      chrome.runtime.sendMessage({
        type: 'KEY_TONES_TOGGLE',
        enabled: message.enabled
      });
    }).catch(e => console.error("Error setting up offscreen document:", e));
  }

  if (message.type === 'TOGGLE_AMBIENT') {
    chrome.storage.local.set({ isAmbientEnabled: message.enabled });
    setupOffscreenDocument('src/offscreen.html').then(() => {
      chrome.runtime.sendMessage({
        type: 'AMBIENT_TOGGLE',
        enabled: message.enabled
      });
    }).catch(e => console.error("Error setting up offscreen document:", e));
  }

  if (message.type === 'UPDATE_INSTRUMENT') {
    chrome.storage.local.set({ currentInstrument: message.instrument });
    setupOffscreenDocument('src/offscreen.html').then(() => {
      chrome.runtime.sendMessage({
        type: 'UPDATE_INSTRUMENT',
        instrument: message.instrument
      });
    }).catch(e => console.error("Error updating instrument:", e));
  }

  if (message.type === 'UPDATE_KEYSTROKE_VOLUME') {
    chrome.storage.local.set({ keystrokeVolume: message.volume });
    setupOffscreenDocument('src/offscreen.html').then(() => {
      chrome.runtime.sendMessage(message);
    });
  }

  if (message.type === 'UPDATE_AMBIENT_VOLUME') {
    chrome.storage.local.set({ ambientVolume: message.volume });
    setupOffscreenDocument('src/offscreen.html').then(() => {
      chrome.runtime.sendMessage(message);
    });
  }

  if (message.type === 'UPDATE_PRESET' || message.type === 'UPDATE_VOLUME') {
    setupOffscreenDocument('src/offscreen.html').then(() => {
      chrome.runtime.sendMessage(message);
    });
  }

  return false;
});

// Setup on extension load
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isTypeMaestroEnabled: true,
    isKeyTonesEnabled: true,
    isAmbientEnabled: false,
    currentPreset: 'Deep Focus',
    currentInstrument: 'Grand Piano',
    masterVolume: 0.8,
    keystrokeVolume: 0.8,
    ambientVolume: 0.3
  });
  setupOffscreenDocument('src/offscreen.html');
});

// Also setup on startup
chrome.runtime.onStartup.addListener(() => {
  setupOffscreenDocument('src/offscreen.html');
});
