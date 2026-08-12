// src/content.js
console.log("TypeMaestro Telemetry Script Injected");

const METRICS_WINDOW_MS = 10000; // 10 seconds sliding window
let keystrokes = [];
let lastKeyTime = Date.now();
let isActive = true;
let hadMetricsSent = false;

// Check state on load
chrome.storage.local.get(['isTypeMaestroEnabled'], (result) => {
  if (result.isTypeMaestroEnabled !== undefined) {
    isActive = result.isTypeMaestroEnabled;
  }
});

// Listen for state changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.isTypeMaestroEnabled) {
    isActive = changes.isTypeMaestroEnabled.newValue;
    if (!isActive) {
      keystrokes = []; // Clear buffer if disabled
    }
  }
});

function isTextInput(element, event) {
  // Ignore keyboard shortcuts (Cmd+C, Ctrl+V, Alt+Tab, etc.)
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }

  if (!element) return true;

  const tagName = element.tagName ? element.tagName.toLowerCase() : '';

  if (tagName === 'textarea') return true;
  if (tagName === 'input') {
    const type = element.type ? element.type.toLowerCase() : 'text';
    const textTypes = ['text', 'search', 'email', 'password', 'tel', 'url', 'number'];
    return textTypes.includes(type);
  }

  if (element.isContentEditable) return true;

  // Check role attribute directly
  if (element.getAttribute && element.getAttribute('role') === 'textbox') {
    return true;
  }

  // Check known rich text editors and code editor containers
  if (element.closest) {
    const isEditor = element.closest(
      '[contenteditable="true"], [contenteditable=""], [role="textbox"], ' +
      '.monaco-editor, .monaco-aria-container, .inputarea, .view-lines, ' +
      '.cm-editor, .cm-content, .CodeMirror, .ace_editor, ' +
      '.ProseMirror, .slate-editor, .ql-editor, .docs-textholder, ' +
      '[data-slate-editor="true"], .notion-page-content'
    );
    if (isEditor) return true;
  }

  // Fallback: Check if pressed key is a typing character (letters, digits, space, backspace, enter, delete)
  const isTypingKey = event.key.length === 1 || ['Backspace', 'Enter', 'Delete', 'Spacebar'].includes(event.key);
  if (isTypingKey && tagName !== 'button' && tagName !== 'a' && tagName !== 'select') {
    return true;
  }

  return false;
}

function calculateAndSendMetrics() {
  const now = Date.now();
  // Keep only events within window
  keystrokes = keystrokes.filter(k => now - k.time <= METRICS_WINDOW_MS);

  if (keystrokes.length === 0) {
    if (hadMetricsSent) {
      sendMetrics({ wpm: 0, burstiness: 0, pauseDuration: now - lastKeyTime, backspaceFrequency: 0 });
      hadMetricsSent = false;
    }
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
  const burstiness = Math.sqrt(variance) || 0;

  // Last Pause Duration
  const currentPauseDuration = now - lastKeyTime;

  sendMetrics({
    wpm,
    burstiness,
    pauseDuration: currentPauseDuration,
    backspaceFrequency
  });
  hadMetricsSent = true;
}

document.addEventListener('keydown', (event) => {
  if (!isActive) return;
  if (!isTextInput(event.target, event)) return;

  // Ignore pure modifier key presses
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(event.key)) {
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

  // Calculate and send telemetry immediately on keypress
  calculateAndSendMetrics();
}, true); // Use capture phase to catch key events before web apps stop propagation

// Also calculate and send metrics periodically (every second)
setInterval(() => {
  if (!isActive) return;
  calculateAndSendMetrics();
}, 1000);

function sendMetrics(metrics) {
  try {
    chrome.runtime.sendMessage({
      type: 'TELEMETRY_UPDATE',
      metrics
    });
  } catch (e) {
    console.debug("Could not send metrics, background worker might be sleeping.", e);
  }
}
