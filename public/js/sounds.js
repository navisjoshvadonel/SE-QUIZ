// public/js/sounds.js
// High-Fidelity Audio Engine: Acoustic OST (Attack on Titan: Eye Water) + Procedural Web Audio SFX

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = localStorage.getItem('se_quiz_muted') === 'true';
    this.isBgmPlaying = false;
    this.bgmAudio = null;
    this.targetBgmVolume = 0.15; // Mild, comfortable background volume
    this.targetPlaybackRate = 0.88; // Slow, contemplative and emotional guitar tempo
    this.fadeInTimer = null;

    this.initAudioElement();
  }

  initAudioElement() {
    try {
      if (!this.bgmAudio) {
        this.bgmAudio = new Audio('/audio/game-track.mp3');
        this.bgmAudio.loop = true;
        this.bgmAudio.volume = this.isMuted ? 0 : this.targetBgmVolume;
        this.bgmAudio.playbackRate = this.targetPlaybackRate;
        this.bgmAudio.preload = 'auto';

        // Seamless loop guarantee across all browser engines
        this.bgmAudio.addEventListener('ended', () => {
          if (!this.isMuted && this.isBgmPlaying) {
            this.bgmAudio.currentTime = 0;
            this.bgmAudio.play().catch(() => {});
          }
        });

        // Ensure playback rate remains gently slowed
        this.bgmAudio.addEventListener('play', () => {
          this.bgmAudio.playbackRate = this.targetPlaybackRate;
        });
      }
    } catch (e) {
      console.warn('Audio element init error:', e);
    }
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

    if (!this.bgmAudio) {
      this.initAudioElement();
    }
  }

  // Smooth fade-in to target volume
  startBgm() {
    if (this.isMuted) return;
    this.init();
    if (!this.bgmAudio) return;

    this.isBgmPlaying = true;
    this.bgmAudio.playbackRate = this.targetPlaybackRate;

    // Start with gentle fade-in
    this.bgmAudio.volume = 0.01;
    const playPromise = this.bgmAudio.play();

    if (playPromise !== undefined) {
      playPromise.then(() => {
        let currentVol = 0.01;
        if (this.fadeInTimer) clearInterval(this.fadeInTimer);
        this.fadeInTimer = setInterval(() => {
          if (this.isMuted || !this.isBgmPlaying) {
            clearInterval(this.fadeInTimer);
            return;
          }
          currentVol += 0.015;
          if (currentVol >= this.targetBgmVolume) {
            this.bgmAudio.volume = this.targetBgmVolume;
            clearInterval(this.fadeInTimer);
          } else {
            this.bgmAudio.volume = Math.min(currentVol, this.targetBgmVolume);
          }
        }, 60);
      }).catch(err => {
        // Autoplay policy prevented immediate playback; waiting for first user gesture
        console.log('Autoplay deferred until user interaction.');
      });
    }
  }

  stopBgm() {
    this.isBgmPlaying = false;
    if (this.fadeInTimer) {
      clearInterval(this.fadeInTimer);
      this.fadeInTimer = null;
    }
    if (this.bgmAudio) {
      try {
        this.bgmAudio.pause();
      } catch (e) {}
    }
  }

  // Keep compatibility with existing calls
  startLobbyMusic() {
    this.startBgm();
  }

  stopLobbyMusic() {
    // The game audio track plays continuously throughout the session.
    // Explicit muting or calling stopBgm() stops playback.
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('se_quiz_muted', this.isMuted ? 'true' : 'false');

    if (this.isMuted) {
      this.stopBgm();
    } else {
      this.startBgm();
    }
    this.updateMuteUI();
    return this.isMuted;
  }

  updateMuteUI() {
    document.querySelectorAll('#btn-sound-toggle, .btn-sound-toggle').forEach(btn => {
      const icon = btn.querySelector('#sound-toggle-icon, .sound-toggle-icon');
      const text = btn.querySelector('#sound-toggle-text, .sound-toggle-text');
      if (icon) icon.textContent = this.isMuted ? '🔇' : '🔊';
      else btn.textContent = this.isMuted ? '🔇' : '🔊';
      if (text) text.textContent = this.isMuted ? 'Muted' : 'Sound';
      btn.setAttribute('title', this.isMuted ? 'Unmute Game Audio' : 'Mute Game Audio');
    });
  }

  setBgmVolume(volume) {
    this.targetBgmVolume = Math.max(0, Math.min(1, volume));
    if (this.bgmAudio && !this.isMuted) {
      this.bgmAudio.volume = this.targetBgmVolume;
    }
  }

  setPlaybackRate(rate) {
    this.targetPlaybackRate = Math.max(0.5, Math.min(2, rate));
    if (this.bgmAudio) {
      this.bgmAudio.playbackRate = this.targetPlaybackRate;
    }
  }

  // Web Audio Procedural Sound Effects
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

  // Juicy Click Pop for buttons
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
}

window.sounds = new SoundEngine();

// Auto-start ambient music and prime Web Audio context on first user gesture anywhere
['pointerdown', 'keydown', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (window.sounds) {
      window.sounds.init();
      if (!window.sounds.isBgmPlaying && !window.sounds.isMuted) {
        window.sounds.startBgm();
      }
    }
  }, { once: true });
});

// Sync UI mute state on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  if (window.sounds) {
    window.sounds.updateMuteUI();
  }
});

