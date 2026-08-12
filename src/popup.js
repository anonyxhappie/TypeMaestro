// src/popup.js

document.addEventListener('DOMContentLoaded', () => {
  const powerToggle = document.getElementById('powerToggle');
  const keyTonesToggle = document.getElementById('keyTonesToggle');
  const ambientToggle = document.getElementById('ambientToggle');
  const wpmDisplay = document.getElementById('wpmDisplay');
  const statusDisplay = document.getElementById('statusDisplay');
  const instrumentSelect = document.getElementById('instrumentSelect');
  const presetSelect = document.getElementById('presetSelect');
  const volumeSlider = document.getElementById('volumeSlider');
  const keystrokeVolumeSlider = document.getElementById('keystrokeVolumeSlider');
  const ambientVolumeSlider = document.getElementById('ambientVolumeSlider');

  // Load initial state
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
    if (result.isTypeMaestroEnabled !== undefined) {
      powerToggle.checked = result.isTypeMaestroEnabled;
      updateStatusDisplay(result.isTypeMaestroEnabled);
    }
    if (result.isKeyTonesEnabled !== undefined) {
      keyTonesToggle.checked = result.isKeyTonesEnabled;
    }
    if (result.isAmbientEnabled !== undefined) {
      ambientToggle.checked = result.isAmbientEnabled;
    }
    if (result.currentInstrument) {
      instrumentSelect.value = result.currentInstrument;
    }
    if (result.currentPreset) {
      presetSelect.value = result.currentPreset;
    }
    if (result.masterVolume !== undefined) {
      volumeSlider.value = result.masterVolume;
    }
    if (result.keystrokeVolume !== undefined) {
      keystrokeVolumeSlider.value = result.keystrokeVolume;
    }
    if (result.ambientVolume !== undefined) {
      ambientVolumeSlider.value = result.ambientVolume;
    }
  });

  function updateStatusDisplay(isEnabled) {
    if (!isEnabled) {
      statusDisplay.textContent = "Engine Paused";
      statusDisplay.style.color = "#888";
    } else {
      statusDisplay.textContent = "Listening...";
      statusDisplay.style.color = "#4CAF50";
    }
  }

  // Handle Power Toggle
  powerToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    updateStatusDisplay(isEnabled);

    chrome.runtime.sendMessage({
      type: 'TOGGLE_EXTENSION',
      enabled: isEnabled
    });
  });

  // Handle Keystroke Tones Toggle
  keyTonesToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ isKeyTonesEnabled: isEnabled });

    chrome.runtime.sendMessage({
      type: 'TOGGLE_KEY_TONES',
      enabled: isEnabled
    });
  });

  // Handle Ambient Toggle
  ambientToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ isAmbientEnabled: isEnabled });

    chrome.runtime.sendMessage({
      type: 'TOGGLE_AMBIENT',
      enabled: isEnabled
    });
  });

  // Handle Instrument Change
  instrumentSelect.addEventListener('change', (e) => {
    const instrument = e.target.value;
    chrome.storage.local.set({ currentInstrument: instrument });

    chrome.runtime.sendMessage({
      type: 'UPDATE_INSTRUMENT',
      instrument: instrument
    });
  });

  // Handle Preset Change
  presetSelect.addEventListener('change', (e) => {
    const preset = e.target.value;
    chrome.storage.local.set({ currentPreset: preset });

    chrome.runtime.sendMessage({
      type: 'UPDATE_PRESET',
      preset: preset
    });
  });

  // Handle Keystroke Volume Change
  keystrokeVolumeSlider.addEventListener('input', (e) => {
    const volume = parseFloat(e.target.value);
    chrome.storage.local.set({ keystrokeVolume: volume });

    chrome.runtime.sendMessage({
      type: 'UPDATE_KEYSTROKE_VOLUME',
      volume: volume
    });
  });

  // Handle Ambient Volume Change
  ambientVolumeSlider.addEventListener('input', (e) => {
    const volume = parseFloat(e.target.value);
    chrome.storage.local.set({ ambientVolume: volume });

    chrome.runtime.sendMessage({
      type: 'UPDATE_AMBIENT_VOLUME',
      volume: volume
    });
  });

  // Handle Master Volume Change
  volumeSlider.addEventListener('input', (e) => {
    const volume = parseFloat(e.target.value);
    chrome.storage.local.set({ masterVolume: volume });

    chrome.runtime.sendMessage({
      type: 'UPDATE_VOLUME',
      volume: volume
    });
  });

  // Listen for Telemetry updates to update WPM UI
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TELEMETRY_UPDATE' || message.type === 'ENGINE_UPDATE') {
      const wpm = Math.round(message.metrics.wpm || 0);
      wpmDisplay.textContent = `${wpm} WPM`;

      if (powerToggle.checked) {
        if (wpm === 0) {
           statusDisplay.textContent = "Awaiting input...";
        } else {
           statusDisplay.textContent = "Generating...";
        }
      }
    }
  });
});
