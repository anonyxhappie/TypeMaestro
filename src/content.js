// src/content.js
console.log("TypeMaestro Telemetry Script Injected");

const METRICS_WINDOW_MS = 10000; // 10 seconds sliding window
let keystrokes = [];
let lastKeyTime = Date.now();
let isActive = true;

// Check state on load
chrome.storage.local.get(['isTypeMaestroEnabled'], (result) => {
  if (result.isTypeMaestroEnabled !== undefined) {
    isActive = result.isTypeMaestroEnabled;
  }
});

// Listen for state changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.isTypeMaestroEnabled) {
    isActive = changes.isTypeMaestroEnabled.newValue;
    if (!isActive) {
      keystrokes = []; // Clear buffer if disabled
    }
  }
});

function isTextInput(element) {
  if (!element) return false;

  const tagName = element.tagName.toLowerCase();

  if (tagName === 'textarea') return true;
  if (tagName === 'input') {
    const type = element.type.toLowerCase();
    const textTypes = ['text', 'search', 'email', 'password', 'tel', 'url'];
    return textTypes.includes(type);
  }

  return element.isContentEditable;
}

document.addEventListener('keydown', (event) => {
  if (!isActive) return;
  if (!isTextInput(event.target)) return;

  // Ignore modifier keys
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(event.key)) {
    return;
  }

  const now = Date.now();
  const pauseDuration = now - lastKeyTime;
  lastKeyTime = now;

  keystrokes.push({
    time: now,
    key: event.key,
    pauseDuration
  });

  // Keep only events within the window
  keystrokes = keystrokes.filter(k => now - k.time <= METRICS_WINDOW_MS);
});

// Calculate and send metrics periodically
setInterval(() => {
  if (!isActive || keystrokes.length === 0) return;

  const now = Date.now();
  // Filter one more time in case of inactivity
  keystrokes = keystrokes.filter(k => now - k.time <= METRICS_WINDOW_MS);

  if (keystrokes.length === 0) {
    sendMetrics({ wpm: 0, burstiness: 0, pauseDuration: 0, backspaceFrequency: 0 });
    return;
  }

  const keysCount = keystrokes.length;
  // Standard word is ~5 characters
  const wpm = (keysCount / 5) * (60000 / METRICS_WINDOW_MS);

  // Backspace Frequency
  const backspaces = keystrokes.filter(k => k.key === 'Backspace').length;
  const backspaceFrequency = backspaces / keysCount;

  // Burstiness (variance of pause durations)
  const pauses = keystrokes.map(k => k.pauseDuration);
  const avgPause = pauses.reduce((a, b) => a + b, 0) / pauses.length;
  const variance = pauses.reduce((a, b) => a + Math.pow(b - avgPause, 2), 0) / pauses.length;
  // Normalize variance slightly for easier mapping (using standard deviation)
  const burstiness = Math.sqrt(variance) || 0;

  // Last Pause Duration (time since last keypress)
  const currentPauseDuration = now - lastKeyTime;

  sendMetrics({
    wpm,
    burstiness,
    pauseDuration: currentPauseDuration,
    backspaceFrequency
  });

}, 1000); // Send updates every second

function sendMetrics(metrics) {
  try {
    chrome.runtime.sendMessage({
      type: 'TELEMETRY_UPDATE',
      metrics
    });
  } catch (e) {
    // Background worker might be inactive, ignore or handle gracefully
    console.debug("Could not send metrics, background worker might be sleeping.", e);
  }
}
