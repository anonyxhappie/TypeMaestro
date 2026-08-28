// src/offscreen.js
import { pipeline, env } from '@xenova/transformers';

console.log("Offscreen Engine Injected");

// Disable local models fallback to ensure it uses huggingface cache
env.allowLocalModels = false;
env.useBrowserCache = true;

let isEngineEnabled = true;
let isKeyTonesEnabled = true;
let isAmbientEnabled = false;
let currentMetrics = { wpm: 0, burstiness: 0, pauseDuration: 0, backspaceFrequency: 0 };
let currentPreset = 'Deep Focus';
let currentInstrument = 'Grand Piano';
let masterVolume = 0.8;
let keystrokeVolume = 0.8;
let ambientVolume = 0.3;
let isAudioWarmedUp = false;

// Precompute MIDI frequencies for performance (0-127)
const midiFrequencyTable = new Float32Array(128);
for (let i = 0; i < 128; i++) {
  midiFrequencyTable[i] = 440 * Math.pow(2, (i - 69) / 12);
}

// === Web Audio API Synthesizer (Lazy Initializer) ===
let audioCtx = null;
let masterGain = null;
let keystrokeGain = null;
let ambientGain = null;
let convolver = null;
let reverbGain = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(audioCtx.destination);

    keystrokeGain = audioCtx.createGain();
    keystrokeGain.gain.value = keystrokeVolume;
    keystrokeGain.connect(masterGain);

    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = ambientVolume;
    ambientGain.connect(masterGain);

    reverbGain = audioCtx.createGain();
    reverbGain.gain.value = 0.3;
    reverbGain.connect(masterGain);

    try {
      const sampleRate = audioCtx.sampleRate || 44100;
      const impulseLength = Math.max(1000, sampleRate * 2.0);
      const impulseBuffer = audioCtx.createBuffer(2, impulseLength, sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulseBuffer.getChannelData(channel);
        for (let i = 0; i < impulseLength; i++) {
          channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 3);
        }
      }
      convolver = audioCtx.createConvolver();
      convolver.buffer = impulseBuffer;
      convolver.connect(reverbGain);
    } catch (e) {
      console.warn("Convolver reverb setup deferred:", e);
      convolver = null;
    }
  }
  return audioCtx;
}

function warmUpAudioContext() {
  try {
    const keepAliveAudio = document.getElementById('keepAliveAudio');
    if (keepAliveAudio && keepAliveAudio.paused) {
      keepAliveAudio.play().catch(() => {});
    }
  } catch (e) {}

  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  isAudioWarmedUp = true;
}

// Automatic Node Garbage Collection Cleanup to Prevent Chrome Memory Leaks & Crashes
function autoCleanup(oscNode, ...connectedNodes) {
  oscNode.onended = () => {
    try {
      oscNode.disconnect();
      connectedNodes.forEach(n => {
        if (n && typeof n.disconnect === 'function') n.disconnect();
      });
    } catch (e) {}
  };
}

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
  if (!isEngineEnabled || !isAmbientEnabled || ambientVolume <= 0) return;
  const ctx = getAudioContext();
  if (!isAudioWarmedUp) warmUpAudioContext();

  const config = getPresetConfig();
  if (reverbGain) {
    reverbGain.gain.setTargetAtTime(config.reverb, ctx.currentTime, 0.1);
  }

  // Convert MIDI note to frequency
  const frequency = midiFrequencyTable[midiNote] || 440 * Math.pow(2, (midiNote - 69) / 12);

  const osc = ctx.createOscillator();
  osc.type = config.type;
  osc.frequency.value = frequency;

  const noteGain = ctx.createGain();
  const maxNoteGain = (velocity / 127) * 0.3;
  const now = ctx.currentTime;
  noteGain.gain.setValueAtTime(0.0001, now);
  noteGain.gain.linearRampToValueAtTime(maxNoteGain, now + config.attack);
  noteGain.gain.setTargetAtTime(0.0001, now + config.attack, config.release * 0.3);

  osc.connect(noteGain);
  noteGain.connect(ambientGain);
  if (convolver) {
    noteGain.connect(convolver);
  }

  const stopTime = now + config.attack + config.release * 2;
  osc.start(now);
  osc.stop(stopTime);
  autoCleanup(osc, noteGain);
}

// === 1-to-1 Deterministic Keystroke Tone Mapping ===
const keyToPitchMap = {
  'a': 60, 'b': 61, 'c': 62, 'd': 63, 'e': 64, 'f': 65, 'g': 66, 'h': 67, 'i': 68, 'j': 69, 'k': 70, 'l': 71, 'm': 72, 'n': 73, 'o': 74, 'p': 75, 'q': 57, 'r': 58, 's': 59, 't': 76, 'u': 77, 'v': 78, 'w': 79, 'x': 80, 'y': 81, 'z': 82,
  '0': 84, '1': 85, '2': 86, '3': 87, '4': 88, '5': 89, '6': 90, '7': 91, '8': 92, '9': 93,
  ' ': 48, 'Enter': 96, 'Backspace': 52, 'Delete': 50, 'Tab': 55
};

function getKeyNotesSequence(key) {
  if (!key) return [60];
  const lowerKey = key.toLowerCase();

  if (keyToPitchMap[lowerKey] !== undefined) {
    let pitch = keyToPitchMap[lowerKey];
    // Uppercase letters play 12 semitones higher (1 octave up)
    if (key !== lowerKey && key.length === 1) {
      pitch = Math.min(108, pitch + 12);
    }
    return [pitch];
  }

  // Fallback hash for punctuation or non-alphanumeric keys
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return [55 + (Math.abs(hash) % 36)];
}

function playInstrumentToneSync(midiNote, velocity = 85) {
  if (!isEngineEnabled || !isKeyTonesEnabled || keystrokeVolume <= 0) return;
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const frequency = midiFrequencyTable[midiNote] || 440 * Math.pow(2, (midiNote - 69) / 12);
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const noteGain = ctx.createGain();

  let attack = 0.008;
  let release = 0.4;
  let type = 'sine';
  let reverbAmount = 0.25;

  if (currentInstrument === 'Crystal Chimes') {
    type = 'sine';
    attack = 0.004;
    release = 0.8;
    reverbAmount = 0.5;

    const overtoneOsc = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    overtoneOsc.type = 'sine';
    overtoneOsc.frequency.value = frequency * 2;
    overtoneGain.gain.setValueAtTime(0.0001, now);
    overtoneGain.gain.linearRampToValueAtTime(0.06, now + attack);
    overtoneGain.gain.setTargetAtTime(0.0001, now + attack, release * 0.25);
    overtoneOsc.connect(overtoneGain);
    overtoneGain.connect(keystrokeGain);
    
    const overtoneStop = now + release * 1.5;
    overtoneOsc.start(now);
    overtoneOsc.stop(overtoneStop);
    autoCleanup(overtoneOsc, overtoneGain);

    osc.connect(noteGain);
  } else if (currentInstrument === 'Wood Marimba') {
    type = 'triangle';
    attack = 0.002;
    release = 0.2;
    reverbAmount = 0.1;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency * 2.5;
    osc.connect(filter);
    filter.connect(noteGain);
  } else if (currentInstrument === 'Retro Synth') {
    type = 'square';
    attack = 0.005;
    release = 0.3;
    reverbAmount = 0.08;
    osc.connect(noteGain);
  } else if (currentInstrument === 'Ethereal Pad') {
    type = 'sine';
    attack = 0.08;
    release = 1.2;
    reverbAmount = 0.6;
    osc.connect(noteGain);
  } else { // Grand Piano
    type = 'sine';
    attack = 0.01;
    release = 0.6;
    reverbAmount = 0.3;

    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.value = frequency / 2;
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(0.04, now + attack);
    subGain.gain.setTargetAtTime(0.0001, now + attack, release * 0.25);
    subOsc.connect(subGain);
    subGain.connect(keystrokeGain);
    
    const subStop = now + release * 1.5;
    subOsc.start(now);
    subOsc.stop(subStop);
    autoCleanup(subOsc, subGain);

    osc.connect(noteGain);
  }

  osc.type = type;
  osc.frequency.value = frequency;

  if (reverbGain) {
    reverbGain.gain.setTargetAtTime(reverbAmount, now, 0.05);
  }

  const maxGain = (velocity / 127) * 0.4;
  noteGain.gain.setValueAtTime(maxGain, now);
  noteGain.gain.setTargetAtTime(0.0001, now + attack, release * 0.25);

  noteGain.connect(keystrokeGain);

  const stopTime = now + attack + release * 1.5;
  osc.start(now);
  osc.stop(stopTime);
  autoCleanup(osc, noteGain);
}

function handleKeyTonePlayback(key) {
  if (!isEngineEnabled || !isKeyTonesEnabled || keystrokeVolume <= 0) return;
  if (!isAudioWarmedUp) warmUpAudioContext();
  const notes = getKeyNotesSequence(key);
  playInstrumentToneSync(notes[0], 85);
}

// === Real-time High-Performance Procedural Engine ===
let isGenerating = false;
let lastMidiNote = 60;
const scale = [0, 2, 4, 5, 7, 9, 11]; // Major scale intervals

async function generateNextNotes() {
  if (!isEngineEnabled || !isAmbientEnabled || ambientVolume <= 0) return;

  const step = scale[Math.floor(Math.random() * scale.length)];
  const octave = Math.floor(Math.random() * 2) - 1;
  const jumpMultiplier = currentMetrics.burstiness > 5 ? 2 : 1;
  let nextMidi = 60 + step + (octave * 12 * jumpMultiplier);

  if (nextMidi < 48) nextMidi += 12;
  if (nextMidi > 84) nextMidi -= 12;

  let velocity = 60 + (currentMetrics.burstiness * 2);
  if (currentMetrics.backspaceFrequency > 0.1) velocity -= 20;
  velocity = Math.min(127, Math.max(30, velocity));

  playNote(nextMidi, velocity);
  lastMidiNote = nextMidi;
}

function startGenerationLoop() {
  if (isGenerating) return;
  isGenerating = true;

  const loop = async () => {
    if (isEngineEnabled && isAmbientEnabled && currentMetrics.wpm > 0 && ambientVolume > 0) {
       await generateNextNotes();
    }
    const config = getPresetConfig();
    let delay = config.delay;
    if (currentMetrics.wpm > 0) {
      delay = delay * Math.max(0.4, 1 - (currentMetrics.wpm / 150));
    } else {
      delay = 1000;
    }
    setTimeout(loop, delay);
  };
  loop();
}

// === Port Stream & Messaging Management ===

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keystroke-stream') {
    port.onMessage.addListener((message) => {
      if (message && message.key) {
        handleKeyTonePlayback(message.key);
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PLAY_KEY_TONE' || message.type === 'KEY_STROKE_EVENT') {
    handleKeyTonePlayback(message.key);
  }

  if (message.type === 'ENGINE_UPDATE') {
    currentMetrics = message.metrics;
    if (currentMetrics.wpm > 0 && !isGenerating && isAmbientEnabled && ambientVolume > 0) {
        startGenerationLoop();
    }
  }

  if (message.type === 'ENGINE_TOGGLE') {
    isEngineEnabled = message.enabled;
    if (isEngineEnabled && isAmbientEnabled && !isGenerating && ambientVolume > 0) {
        startGenerationLoop();
    }
  }

  if (message.type === 'KEY_TONES_TOGGLE') {
    isKeyTonesEnabled = message.enabled;
  }

  if (message.type === 'AMBIENT_TOGGLE') {
    isAmbientEnabled = message.enabled;
    if (isEngineEnabled && isAmbientEnabled && !isGenerating && ambientVolume > 0) {
        startGenerationLoop();
    }
  }

  if (message.type === 'UPDATE_INSTRUMENT') {
    currentInstrument = message.instrument;
  }

  if (message.type === 'UPDATE_PRESET') {
    currentPreset = message.preset;
  }

  if (message.type === 'UPDATE_KEYSTROKE_VOLUME') {
    keystrokeVolume = message.volume;
    if (keystrokeGain && audioCtx) {
      keystrokeGain.gain.setTargetAtTime(keystrokeVolume, audioCtx.currentTime, 0.05);
    }
  }

  if (message.type === 'UPDATE_AMBIENT_VOLUME') {
    ambientVolume = message.volume;
    if (ambientGain && audioCtx) {
      ambientGain.gain.setTargetAtTime(ambientVolume, audioCtx.currentTime, 0.05);
    }
  }

  if (message.type === 'UPDATE_VOLUME') {
    masterVolume = message.volume;
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(masterVolume, audioCtx.currentTime, 0.05);
    }
  }
});

// Load state initially via background service worker (chrome.storage is unavailable in offscreen documents)
chrome.runtime.sendMessage({ type: 'GET_INITIAL_STATE' }, (result) => {
  if (chrome.runtime.lastError) {
    console.warn("Could not retrieve initial state from background worker:", chrome.runtime.lastError.message);
  } else if (result) {
    if (result.isTypeMaestroEnabled !== undefined) isEngineEnabled = result.isTypeMaestroEnabled;
    if (result.isKeyTonesEnabled !== undefined) isKeyTonesEnabled = result.isKeyTonesEnabled;
    if (result.isAmbientEnabled !== undefined) isAmbientEnabled = result.isAmbientEnabled;
    if (result.currentPreset) currentPreset = result.currentPreset;
    if (result.currentInstrument) currentInstrument = result.currentInstrument;
    if (result.masterVolume !== undefined) {
      masterVolume = result.masterVolume;
      if (masterGain && audioCtx) {
        masterGain.gain.value = masterVolume;
      }
    }
    if (result.keystrokeVolume !== undefined) {
      keystrokeVolume = result.keystrokeVolume;
      if (keystrokeGain && audioCtx) {
        keystrokeGain.gain.value = keystrokeVolume;
      }
    }
    if (result.ambientVolume !== undefined) {
      ambientVolume = result.ambientVolume;
      if (ambientGain && audioCtx) {
        ambientGain.gain.value = ambientVolume;
      }
    }
  }

  // Initialize procedural audio engine
  startGenerationLoop();
});
