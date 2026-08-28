const ITERATIONS = 10_000_000;

const IGNORED_KEYS_SET = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape']);

function inlineArray(key) {
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(key)) {
    return true;
  }
  return false;
}

function hoistedSet(key) {
  if (IGNORED_KEYS_SET.has(key)) {
    return true;
  }
  return false;
}

// Warm up
for (let i = 0; i < 1000; i++) {
  inlineArray('A');
  hoistedSet('A');
}

// Benchmark
const keys = ['A', 'Shift', 'Enter', 'Meta', 'a', 'b', 'c', 'Tab'];

let start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  inlineArray(keys[i % keys.length]);
}
let end = performance.now();
const inlineTime = end - start;
console.log(`Inline Array: ${inlineTime.toFixed(2)} ms`);

start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  hoistedSet(keys[i % keys.length]);
}
end = performance.now();
const hoistedSetTime = end - start;
console.log(`Hoisted Set: ${hoistedSetTime.toFixed(2)} ms`);

console.log(`Improvement: ${((inlineTime - hoistedSetTime) / inlineTime * 100).toFixed(2)}% faster`);
