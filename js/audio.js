/**
 * HUNGRY NOODLE — procedural cartoon sound, generated with the Web Audio API.
 *
 * No audio files: every sound is built from oscillators plus one short noise
 * buffer that is created once and reused. Everything is a no-op when muted or
 * when the browser has no AudioContext.
 */
(function (NS) {
  'use strict';

  NS.createAudio = function createAudio(storage) {
    const MUTED_KEY = NS.STORAGE_KEYS.MUTED;

    let context = null;
    let master = null;
    let noiseBuffer = null;
    let muted = storage.read(MUTED_KEY, 'false') === 'true';
    let voices = 0;          // crude polyphony guard against a sound storm

    /** Lazily create the context; browsers require a user gesture first. */
    function ensureContext() {
      if (context) {
        if (context.state === 'suspended') context.resume();
        return context;
      }
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      try {
        context = new Ctor();
        master = context.createGain();
        master.gain.value = muted ? 0 : 0.9;
        master.connect(context.destination);
      } catch (error) {
        context = null;
      }
      return context;
    }

    /** One second of white noise, built once and shared by every crunch. */
    function getNoise(ctx) {
      if (noiseBuffer) return noiseBuffer;
      const length = Math.floor(ctx.sampleRate * 0.4);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      return noiseBuffer;
    }

    function canPlay() {
      if (muted) return null;
      const ctx = ensureContext();
      if (!ctx || voices > 14) return null;
      return ctx;
    }

    /**
     * One enveloped oscillator note.
     * @param {object} spec {freq, toFreq, type, duration, volume, delay, wobble}
     */
    function note(spec) {
      const ctx = canPlay();
      if (!ctx) return;

      const start = ctx.currentTime + (spec.delay || 0);
      const duration = spec.duration || 0.12;
      const volume = spec.volume === undefined ? 0.16 : spec.volume;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = spec.type || 'sine';
      osc.frequency.setValueAtTime(spec.freq, start);
      if (spec.toFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.toFreq), start + duration);
      }

      // A little pitch wobble is what makes it read as cartoon rather than synth
      if (spec.wobble) {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = spec.wobble;
        lfoGain.gain.value = spec.freq * 0.06;
        lfo.connect(lfoGain).connect(osc.frequency);
        lfo.start(start);
        lfo.stop(start + duration + 0.05);
      }

      // Exponential ramps can't touch zero, so fade to a near-silent value.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain).connect(master);
      voices += 1;
      osc.onended = () => { voices -= 1; gain.disconnect(); };
      osc.start(start);
      osc.stop(start + duration + 0.03);
    }

    /** A short filtered noise burst — the crunch in a chomp. */
    function crunch(spec) {
      const ctx = canPlay();
      if (!ctx) return;

      const start = ctx.currentTime + (spec.delay || 0);
      const duration = spec.duration || 0.08;

      const source = ctx.createBufferSource();
      source.buffer = getNoise(ctx);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = spec.freq || 1200;
      filter.Q.value = 1.2;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(spec.volume || 0.12, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      source.connect(filter).connect(gain).connect(master);
      voices += 1;
      source.onended = () => { voices -= 1; gain.disconnect(); };
      source.start(start);
      source.stop(start + duration + 0.02);
    }

    return {
      unlock: ensureContext,

      /** A wet chomp that climbs with the hunger streak. */
      eat(options) {
        const opts = options || {};
        const streak = Math.min(opts.streak || 1, 8);
        const count = opts.count || 1;

        // Every seventh snack, a small comedy burp instead
        if (count > 0 && count % 7 === 0) {
          note({ freq: 180, toFreq: 70, type: 'sawtooth', duration: 0.26, volume: 0.15, wobble: 14 });
          return;
        }

        const base = 480 * Math.pow(1.06, streak - 1);
        note({ freq: base, toFreq: base * 1.5, type: 'triangle', duration: 0.07, volume: 0.17 });
        note({ freq: base * 1.5, toFreq: base * 1.9, type: 'sine', duration: 0.07, volume: 0.1, delay: 0.055 });
        crunch({ freq: 1500, duration: 0.07, volume: 0.1 });
      },

      levelUp() {
        [523.25, 659.25, 830.61].forEach((freq, i) => {
          note({ freq, toFreq: freq * 1.02, type: 'triangle', duration: 0.13, volume: 0.13, delay: i * 0.07 });
        });
      },

      gameOver(cause) {
        if (cause === 'win') {
          [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            note({ freq, type: 'triangle', duration: 0.2, volume: 0.14, delay: i * 0.1 });
          });
          return;
        }
        // Deflating slide, then a soft thud
        note({ freq: 420, toFreq: 90, type: 'sawtooth', duration: 0.55, volume: 0.14, wobble: 9 });
        note({ freq: 120, toFreq: 48, type: 'sine', duration: 0.5, volume: 0.2, delay: 0.3 });
        crunch({ freq: 220, duration: 0.2, volume: 0.1, delay: 0.32 });
      },

      record() {
        [659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
          note({ freq, type: 'square', duration: 0.14, volume: 0.1, delay: i * 0.09 });
          note({ freq: freq / 2, type: 'triangle', duration: 0.16, volume: 0.08, delay: i * 0.09 });
        });
      },

      start() {
        note({ freq: 300, toFreq: 700, type: 'triangle', duration: 0.18, volume: 0.12 });
      },

      click() {
        note({ freq: 340, toFreq: 460, type: 'triangle', duration: 0.05, volume: 0.09 });
      },

      turn() {
        note({ freq: 220, type: 'sine', duration: 0.035, volume: 0.05 });
      },

      isMuted() { return muted; },

      setMuted(value) {
        muted = Boolean(value);
        storage.write(MUTED_KEY, muted);
        if (master) master.gain.value = muted ? 0 : 0.9;
        if (!muted) ensureContext();
      },
    };
  };
}(window.HungryNoodle));
