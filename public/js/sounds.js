// public/js/sounds.js
// Procedural Web Audio API sound synthesizer with Attack on Titan "Eye-Water" OST & Haptic Feedback

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.isBgmPlaying = false;
    this.bgmVolume = 0.032; // Very gentle low ambient volume as requested
  }

  init() {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopLobbyMusic();
    } else {
      this.startLobbyMusic();
    }
    return this.isMuted;
  }

  playTone(freq, type = 'sine', duration = 0.2, gainValue = 0.15) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(gainValue, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  }

  // Soft piano note synthesizer for atmospheric OST
  playPianoNote(freq, duration = 1.1, gainValue = 0.032) {
    if (this.isMuted || !freq) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(350, now + duration);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.linearRampToValueAtTime(gainValue, now + 0.025);
      gainNode.gain.exponentialRampToValueAtTime(gainValue * 0.35, now + 0.28);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
    } catch (e) {}
  }

  // Addicting Juicy Click Pop
  playClickPop() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.07);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {}
  }

  playSelect() {
    this.playClickPop();
  }

  playCountdownTick() {
    this.playTone(440, 'triangle', 0.12, 0.25);
  }

  playGo() {
    if (this.isMuted) return;
    this.init();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'sine', 0.25, 0.2), idx * 60);
    });
  }

  playCorrect() {
    if (this.isMuted) return;
    this.init();
    const notes = [587.33, 739.99, 880, 1174.66]; // D maj triumph
    notes.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'triangle', 0.35, 0.2), idx * 75);
    });
  }

  playIncorrect() {
    if (this.isMuted) return;
    this.init();
    this.playTone(220, 'sawtooth', 0.25, 0.15);
    setTimeout(() => this.playTone(185, 'sawtooth', 0.35, 0.15), 150);
  }

  playStreak() {
    if (this.isMuted) return;
    this.init();
    const notes = [440, 554.37, 659.25, 880, 1108.73];
    notes.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 'sine', 0.25, 0.2), idx * 50);
    });
  }

  playFanfare() {
    if (this.isMuted) return;
    this.init();
    const sequence = [
      { f: 523.25, d: 0.15, t: 0 },
      { f: 523.25, d: 0.15, t: 150 },
      { f: 523.25, d: 0.15, t: 300 },
      { f: 659.25, d: 0.35, t: 450 },
      { f: 783.99, d: 0.2,  t: 750 },
      { f: 1046.5, d: 0.6,  t: 950 }
    ];
    sequence.forEach(item => {
      setTimeout(() => this.playTone(item.f, 'triangle', item.d, 0.25), item.t);
    });
  }

  // Attack on Titan: "Eye-Water" (Hiroyuki Sawano) Ambient Theme Loop (Low Volume)
  startLobbyMusic() {
    if (this.isMuted || this.isBgmPlaying) return;
    this.init();
    this.isBgmPlaying = true;
    this.bgmStep = 0;

    // Frequencies (Hz)
    const B3 = 246.94, C4 = 261.63, D4 = 293.66, E4 = 329.63, Fs4 = 369.99, G4 = 392.00, A4 = 440.00;
    const B4 = 493.88, C5 = 523.25, D5 = 587.33, E5 = 659.25, Fs5 = 739.99, G5 = 783.99;
    const E2 = 82.41, C3 = 130.81, G2 = 98.00, D3 = 146.83, E3 = 164.81, G3 = 196.00, A3 = 220.00;

    // Attack on Titan "Eye-Water" Iconic progression (Melody + Soft Chords)
    const eyeWaterSequence = [
      // Phrase 1 (Em chord - iconic intro motif)
      { m: B4, b: E3, d: 1.0 },
      { m: E5, b: null, d: 0.8 },
      { m: D5, b: B3, d: 0.8 },
      { m: B4, b: null, d: 0.8 },
      { m: A4, b: G3, d: 0.9 },
      { m: G4, b: null, d: 0.6 },
      { m: A4, b: B3, d: 0.7 },
      { m: B4, b: null, d: 1.0 },

      // Phrase 2 (C Major chord)
      { m: G4, b: C3, d: 0.9 },
      { m: E4, b: G3, d: 0.8 },
      { m: G4, b: null, d: 0.7 },
      { m: A4, b: E4, d: 0.7 },
      { m: B4, b: null, d: 1.1 },

      // Phrase 3 (G Major -> D/F#)
      { m: D5, b: G2, d: 0.9 },
      { m: E5, b: D4, d: 0.8 },
      { m: G5, b: null, d: 1.0 },
      { m: Fs5, b: D3, d: 0.9 },
      { m: E5, b: A3, d: 0.8 },
      { m: D5, b: null, d: 0.8 },
      { m: B4, b: Fs4, d: 1.2 },

      // Phrase 4 (Resolution back to Em)
      { m: A4, b: E3, d: 0.8 },
      { m: B4, b: B3, d: 0.9 },
      { m: G4, b: null, d: 0.8 },
      { m: E4, b: G3, d: 1.4 },
      { m: null, b: null, d: 0.6 } // Gentle breath before loop
    ];

    const stepDurationMs = 520; // Flowing 80bpm tempo

    this.bgmTimer = setInterval(() => {
      if (this.isMuted) return;
      const note = eyeWaterSequence[this.bgmStep];
      if (note) {
        if (note.m) this.playPianoNote(note.m, note.d, this.bgmVolume);
        if (note.b) this.playPianoNote(note.b, note.d * 1.3, this.bgmVolume * 0.75);
      }
      this.bgmStep = (this.bgmStep + 1) % eyeWaterSequence.length;
    }, stepDurationMs);
  }

  stopLobbyMusic() {
    this.isBgmPlaying = false;
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

window.sounds = new SoundEngine();

// Auto-start ambient music and prime Web Audio context on first user gesture anywhere
['pointerdown', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (window.sounds) {
      window.sounds.init();
      if (!window.sounds.isBgmPlaying && !window.sounds.isMuted) {
        window.sounds.startLobbyMusic();
      }
    }
  }, { once: true });
});

