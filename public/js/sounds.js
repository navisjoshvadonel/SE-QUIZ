// public/js/sounds.js
// Dedicated Game Soundtrack: Attack on Titan "Eye Water" (Acoustic Guitar OST) in continuous loop

class SoundEngine {
  constructor() {
    this.isMuted = false;
    this.isBgmPlaying = false;
    this.bgmAudio = null;
    this.targetVolume = 0.32; // Mild, clear, comfortable volume
    this.playbackRate = 0.90; // Slow, emotional acoustic guitar tempo
    this.initialized = false;

    this.setupAudio();
  }

  setupAudio() {
    try {
      // Find existing DOM audio element or create new Audio
      let audio = document.getElementById('game-bgm-audio');
      if (!audio) {
        audio = new Audio('/audio/game-track.mp3');
        audio.id = 'game-bgm-audio';
      }
      audio.loop = true;
      audio.volume = this.targetVolume;
      audio.playbackRate = this.playbackRate;
      audio.preload = 'auto';

      // Always enforce loop
      audio.addEventListener('ended', () => {
        if (!this.isMuted) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
      });

      // Maintain slow tempo across play events
      audio.addEventListener('play', () => {
        audio.playbackRate = this.playbackRate;
      });

      this.bgmAudio = audio;
    } catch (e) {
      console.warn('Audio setup error:', e);
    }
  }

  init() {
    if (!this.bgmAudio) {
      this.setupAudio();
    }
  }

  startBgm() {
    if (this.isMuted) return;
    this.init();
    if (!this.bgmAudio) return;

    this.isBgmPlaying = true;
    this.bgmAudio.volume = this.targetVolume;
    this.bgmAudio.playbackRate = this.playbackRate;

    const playPromise = this.bgmAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        this.isBgmPlaying = true;
        this.updateMuteUI();
      }).catch(() => {
        // Autoplay policy: will trigger on next user touch/click
      });
    }
  }

  stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmAudio) {
      try {
        this.bgmAudio.pause();
      } catch (e) {}
    }
  }

  startLobbyMusic() {
    this.startBgm();
  }

  stopLobbyMusic() {
    // Kept continuous - music plays throughout the entire game
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
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
      if (text) text.textContent = this.isMuted ? 'Muted' : 'Music';
      btn.setAttribute('title', this.isMuted ? 'Play Music' : 'Mute Music');
    });
  }

  // Silent placeholders so no beep/synth can ever play over this music
  playTone() {}
  playClickPop() {}
  playSelect() {}
  playCountdownTick() {}
  playGo() {}
  playCorrect() {}
  playIncorrect() {}
  playStreak() {}
  playFanfare() {}
}

window.sounds = new SoundEngine();

// Play the music as soon as user interacts anywhere on the page
['pointerdown', 'keydown', 'touchstart', 'click'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (window.sounds && !window.sounds.isBgmPlaying && !window.sounds.isMuted) {
      window.sounds.startBgm();
    }
  }, { once: false });
});

document.addEventListener('DOMContentLoaded', () => {
  if (window.sounds) {
    window.sounds.init();
    window.sounds.startBgm();
    window.sounds.updateMuteUI();
  }
});

