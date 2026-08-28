import fs from 'fs';
import { performance } from 'perf_hooks';

const code = fs.readFileSync('src/content.js', 'utf8');
const testCode = code
  // Mock Chrome APIs and browser environment
  .replace(/chrome\.storage\.local\.get/g, '(() => {})')
  .replace(/chrome\.storage\.onChanged\.addListener/g, '(() => {})')
  .replace(/document\.addEventListener/g, '(() => {})')
  .replace(/setInterval/g, '(() => {})')
  + `
  // Make functions available for benchmarking
  global.checkIsTextInput = checkIsTextInput;
  `;

// Evaluate the script safely
try {
  eval(testCode);
} catch (e) {
  console.error("Eval error", e);
}

// Create some mock elements and events
const elements = [
  { tagName: 'TEXTAREA' },
  { tagName: 'INPUT', type: 'text' },
  { tagName: 'INPUT', type: 'email' },
  { tagName: 'INPUT', type: 'password' },
  { tagName: 'INPUT', type: 'search' },
  { tagName: 'INPUT', type: 'radio' },
  { tagName: 'DIV', isContentEditable: true },
  { tagName: 'DIV', getAttribute: (attr) => attr === 'role' ? 'textbox' : null },
  { tagName: 'DIV', closest: (sel) => false },
  null
];

const events = [
  { key: 'a' },
  { key: 'A' },
  { key: 'Backspace' },
  { key: 'Enter' },
  { key: 'Shift' },
  { key: 'Tab' },
  { key: 'Control' },
  { key: 'Alt' }
];

const ITERATIONS = 1_000_000;

console.log(`Running benchmark with ${ITERATIONS} iterations...`);

const start = performance.now();

for (let i = 0; i < ITERATIONS; i++) {
  const el = elements[i % elements.length];
  const ev = events[i % events.length];
  checkIsTextInput(el, ev);
}

const end = performance.now();
console.log(`Baseline Execution Time: ${(end - start).toFixed(2)} ms`);
