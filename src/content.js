// src/content.js
console.log("TypeMaestro Telemetry Script Injected");

const METRICS_WINDOW_MS = 10000; // 10 seconds sliding window
let keystrokes = [];
let lastKeyTime = Date.now();
let isActive = true;
let hadMetricsSent = false;
let lastTargetElement = null;
let lastTargetIsInput = false;

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

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'tel', 'url', 'number']);
const TYPING_KEYS = new Set(['Backspace', 'Enter', 'Delete', 'Spacebar']);
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape']);

function checkIsTextInput(element, event) {
  if (!element) return true;

  const tagName = element.tagName ? element.tagName.toLowerCase() : '';

  if (tagName === 'textarea') return true;
  if (tagName === 'input') {
    const type = element.type ? element.type.toLowerCase() : 'text';
    return TEXT_INPUT_TYPES.has(type);
  }

  if (element.isContentEditable) return true;

  if (element.getAttribute && element.getAttribute('role') === 'textbox') {
    return true;
  }

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

  const isTypingKey = event.key.length === 1 || TYPING_KEYS.has(event.key);
  if (isTypingKey && tagName !== 'button' && tagName !== 'a' && tagName !== 'select') {
    return true;
  }

  return false;
}

function isTextInput(element, event) {
  // Ignore keyboard shortcuts (Cmd+C, Ctrl+V, Alt+Tab, etc.)
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }

  if (element && element === lastTargetElement) {
    return lastTargetIsInput;
  }

  const result = checkIsTextInput(element, event);
  lastTargetElement = element;
  lastTargetIsInput = result;
  return result;
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
  if (MODIFIER_KEYS.has(event.key)) {
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

  // Send real-time keystroke event ONLY for immediate tone playback
  sendKeyStroke(event.key);
}, true); // Use capture phase to catch key events before web apps stop propagation

let keystrokePort = null;

function getKeystrokePort() {
  if (!keystrokePort) {
    try {
      keystrokePort = chrome.runtime.connect({ name: 'keystroke-stream' });
      keystrokePort.onDisconnect.addListener(() => {
        keystrokePort = null;
      });
    } catch (e) {
      keystrokePort = null;
    }
  }
  return keystrokePort;
}

function sendKeyStroke(key) {
  try {
    const port = getKeystrokePort();
    if (port) {
      port.postMessage({ type: 'KEY_STROKE', key });
      return;
    }
  } catch (e) {
    keystrokePort = null;
  }

  // Fallback if port fails
  try {
    chrome.runtime.sendMessage({
      type: 'KEY_STROKE_EVENT',
      key
    });
  } catch (e) {}
}

// Calculate and send telemetry metrics strictly periodically (every 1000ms)
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
  } catch (e) {}
}
