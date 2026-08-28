const iterations = 10_000_000;

// Current math-based approach
function calcFreqMath(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

// Pre-computed lookup approach
const MIDI_FREQ_TABLE = new Float32Array(128);
for (let i = 0; i < 128; i++) {
  MIDI_FREQ_TABLE[i] = 440 * Math.pow(2, (i - 69) / 12);
}

function calcFreqLookup(midiNote) {
  return MIDI_FREQ_TABLE[midiNote];
}

console.log(`Running benchmark with ${iterations} iterations...`);

// Test math approach
console.time('Math.pow');
for (let i = 0; i < iterations; i++) {
  calcFreqMath(i % 128);
}
console.timeEnd('Math.pow');

// Test lookup approach
console.time('Lookup');
for (let i = 0; i < iterations; i++) {
  calcFreqLookup(i % 128);
}
console.timeEnd('Lookup');
