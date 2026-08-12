// src/popup.js

document.addEventListener('DOMContentLoaded', () => {
  const powerToggle = document.getElementById('powerToggle');
  const wpmDisplay = document.getElementById('wpmDisplay');
  const statusDisplay = document.getElementById('statusDisplay');
  const presetSelect = document.getElementById('presetSelect');
  const volumeSlider = document.getElementById('volumeSlider');

  // Load initial state
  chrome.storage.local.get(['isTypeMaestroEnabled', 'currentPreset', 'masterVolume'], (result) => {
    if (result.isTypeMaestroEnabled !== undefined) {
      powerToggle.checked = result.isTypeMaestroEnabled;
      updateStatusDisplay(result.isTypeMaestroEnabled);
    }
    if (result.currentPreset) {
      presetSelect.value = result.currentPreset;
    }
    if (result.masterVolume !== undefined) {
      volumeSlider.value = result.masterVolume;
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

  // Handle toggle
  powerToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    updateStatusDisplay(isEnabled);

    chrome.runtime.sendMessage({
      type: 'TOGGLE_EXTENSION',
      enabled: isEnabled
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

  // Handle Volume Change
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
