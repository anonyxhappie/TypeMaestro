// src/offscreen.js
import { pipeline, env } from '@xenova/transformers';

console.log("Offscreen Engine Injected");

// Disable local models fallback to ensure it uses huggingface cache
env.allowLocalModels = false;
env.useBrowserCache = true;

let isEngineEnabled = true;
let currentMetrics = { wpm: 0, burstiness: 0, pauseDuration: 0, backspaceFrequency: 0 };
let currentPreset = 'Deep Focus';
let masterVolume = 0.5;

// === Web Audio API Synthesizer ===
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);
masterGain.gain.value = masterVolume;

// Basic Convolver (Reverb) - generate simple noise impulse response
const convolver = audioCtx.createConvolver();
const reverbGain = audioCtx.createGain();
reverbGain.gain.value = 0.3; // Default reverb mix
const impulseLength = audioCtx.sampleRate * 2.0; // 2 seconds
const impulseBuffer = audioCtx.createBuffer(2, impulseLength, audioCtx.sampleRate);
for (let channel = 0; channel < 2; channel++) {
  const channelData = impulseBuffer.getChannelData(channel);
  for (let i = 0; i < impulseLength; i++) {
    // Exponential decay noise
    channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 3);
  }
}
convolver.buffer = impulseBuffer;
convolver.connect(reverbGain);
reverbGain.connect(masterGain);

function getPresetConfig() {
  switch (currentPreset) {
    case 'Ambient Dream':
      return { type: 'sine', attack: 0.8, release: 2.0, reverb: 0.6, temp: 1.2, delay: 600 };
    case 'Lofi Chill':
      return { type: 'triangle', attack: 0.1, release: 1.0, reverb: 0.4, temp: 0.9, delay: 400 };
    case 'Deep Focus':
    default:
      return { type: 'sine', attack: 0.05, release: 1.5, reverb: 0.2, temp: 0.7, delay: 300 };
  }
}

function playNote(midiNote, velocity) {
  if (!isEngineEnabled) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const config = getPresetConfig();
  reverbGain.gain.setTargetAtTime(config.reverb, audioCtx.currentTime, 0.1);

  // Convert MIDI note to frequency
  const frequency = 440 * Math.pow(2, (midiNote - 69) / 12);

  const osc = audioCtx.createOscillator();
  osc.type = config.type;
  osc.frequency.value = frequency;

  const noteGain = audioCtx.createGain();
  // Map velocity (0-127) to gain (0-1) roughly, apply volume scaling
  const maxNoteGain = (velocity / 127) * 0.3;
  noteGain.gain.setValueAtTime(0, audioCtx.currentTime);
  noteGain.gain.linearRampToValueAtTime(maxNoteGain, audioCtx.currentTime + config.attack);
  noteGain.gain.setTargetAtTime(0, audioCtx.currentTime + config.attack, config.release);

  osc.connect(noteGain);
  noteGain.connect(masterGain);
  noteGain.connect(convolver); // Send to reverb

  osc.start();
  // Stop oscillator after release fully decays
  osc.stop(audioCtx.currentTime + config.attack + config.release * 4);
}

// === AI Engine (NanoMaestro) ===
let generator = null;
let isGenerating = false;

async function initModel() {
  try {
    console.log("Loading utkucoban/NanoMaestro-Realtime...");
    // Using a simple text-generation pipeline since NanoMaestro is typically an autoregressive model.
    // If NanoMaestro-Realtime requires a specific task or custom tokenization handling,
    // we use "text-generation" as a proxy for raw token generation if it's text-based or token-based.
    generator = await pipeline('text-generation', 'utkucoban/NanoMaestro-Realtime');
    console.log("Model loaded successfully.");
    startGenerationLoop();
  } catch (error) {
    console.error("Failed to load model:", error);
  }
}

// Simple fallback procedural generator if the specific model fails to load or isn't a standard text pipeline
let lastMidiNote = 60;
const scale = [0, 2, 4, 5, 7, 9, 11]; // Major scale intervals

async function generateNextNotes() {
  if (!isEngineEnabled) return;
  const config = getPresetConfig();

  // Base generation rate determined by WPM and preset delay
  let delay = config.delay;
  if (currentMetrics.wpm > 0) {
    // Faster typing = slightly faster generation, but clamped to avoid chaos
    const speedFactor = Math.max(0.5, 1 - (currentMetrics.wpm / 100));
    delay = delay * speedFactor;
  } else {
    // If pause is very long, maybe slow down heavily or stop playing
    if (currentMetrics.pauseDuration > 5000) {
       return; // Stop generating if inactive for > 5s
    }
  }

  let nextMidi = 60;

  if (generator) {
    try {
      // Use recent notes or metrics to formulate an input text seed.
      // Assuming NanoMaestro requires sequence of previous pitches as text tokens or similar text-generation compatible input format for the pipeline.
      const seedText = `pitch_${lastMidiNote} wpm_${Math.round(currentMetrics.wpm)}`;
      const out = await generator(seedText, {
        temperature: config.temp,
        max_new_tokens: 2
      });

      // Parse output string/tokens back to MIDI note.
      // This is a generic robust parser looking for numbers or parsing structure, assuming simple text token output.
      const generatedText = out[0].generated_text;

      // Look for a number in the generated text to map to a note
      const matched = generatedText.match(/\d+/);
      if (matched) {
         nextMidi = parseInt(matched[0], 10);
      } else {
         // Hash the string to a note if it output symbolic letters
         let hash = 0;
         for (let i = 0; i < generatedText.length; i++) {
            hash = generatedText.charCodeAt(i) + ((hash << 5) - hash);
         }
         nextMidi = 60 + Math.abs(hash) % 24 - 12;
      }

      // Ensure note is within a pleasant range (C3 to C6)
      if (nextMidi < 48) nextMidi += 12;
      if (nextMidi > 84) nextMidi -= 12;

    } catch (e) {
       console.error("Inference failed, falling back to procedural:", e);
       // Procedural fallback using metrics
       const step = scale[Math.floor(Math.random() * scale.length)];
       const octave = Math.floor(Math.random() * 2) - 1; // -1, 0, 1
       // Use burstiness to increase octave jumps
       const jumpMultiplier = currentMetrics.burstiness > 5 ? 2 : 1;
       nextMidi = 60 + step + (octave * 12 * jumpMultiplier);

       // Ensure note is within a pleasant range
       if (nextMidi < 48) nextMidi += 12;
       if (nextMidi > 84) nextMidi -= 12;
    }
  } else {
       // Procedural fallback using metrics
       const step = scale[Math.floor(Math.random() * scale.length)];
       const octave = Math.floor(Math.random() * 2) - 1;
       nextMidi = 60 + step + (octave * 12);
  }

  // Velocity modulated by backspace frequency and burstiness (typing hard/erratically = higher velocity)
  let velocity = 60 + (currentMetrics.burstiness * 2);
  if (currentMetrics.backspaceFrequency > 0.1) velocity -= 20; // softer when correcting errors
  velocity = Math.min(127, Math.max(30, velocity));

  playNote(nextMidi, velocity);
  lastMidiNote = nextMidi;
}

function startGenerationLoop() {
  if (isGenerating) return;
  isGenerating = true;

  const loop = async () => {
    if (isEngineEnabled && currentMetrics.wpm > 0) {
       await generateNextNotes();
    }
    const config = getPresetConfig();
    let delay = config.delay;
    if (currentMetrics.wpm > 0) {
      delay = delay * Math.max(0.4, 1 - (currentMetrics.wpm / 150));
    } else {
      delay = 1000; // Check every second if idle
    }
    setTimeout(loop, delay);
  };
  loop();
}


// === Messaging and State Management ===

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ENGINE_UPDATE') {
    currentMetrics = message.metrics;
    // If we just started typing, ensure loop is running
    if (currentMetrics.wpm > 0 && !isGenerating) {
        startGenerationLoop();
    }
  }

  if (message.type === 'ENGINE_TOGGLE') {
    isEngineEnabled = message.enabled;
    if (isEngineEnabled && !isGenerating) {
        startGenerationLoop();
    }
  }

  if (message.type === 'UPDATE_PRESET') {
    currentPreset = message.preset;
  }

  if (message.type === 'UPDATE_VOLUME') {
    masterVolume = message.volume;
    masterGain.gain.setTargetAtTime(masterVolume, audioCtx.currentTime, 0.1);
  }
});

// Load state initially
chrome.storage.local.get(['isTypeMaestroEnabled', 'currentPreset', 'masterVolume'], (result) => {
  if (result.isTypeMaestroEnabled !== undefined) isEngineEnabled = result.isTypeMaestroEnabled;
  if (result.currentPreset !== undefined) currentPreset = result.currentPreset;
  if (result.masterVolume !== undefined) {
      masterVolume = result.masterVolume;
      masterGain.gain.value = masterVolume;
  }

  // Try initializing the model
  initModel();

  // If model fails to load, start procedural generation loop as fallback
  setTimeout(() => {
      if (!generator) {
          console.warn("Model initialization timed out or failed. Starting procedural fallback loop.");
          startGenerationLoop();
      }
  }, 5000);
});
