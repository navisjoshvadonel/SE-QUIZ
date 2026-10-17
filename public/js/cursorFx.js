// public/js/cursorFx.js
// High-Performance Addicting Click Particle Burst, Shockwave & Cursor FX
(function() {
  'use strict';

  // Create full-screen overlay canvas for particles
  const canvas = document.createElement('canvas');
  canvas.id = 'fx-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  function attachCanvas() {
    if (document.body && !document.getElementById('fx-canvas')) {
      document.body.appendChild(canvas);
    }
  }
  if (document.body) {
    attachCanvas();
  } else {
    document.addEventListener('DOMContentLoaded', attachCanvas);
  }

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const shockwaves = [];
  let animFrameId = null;

  // Particle color palettes
  const DEFAULT_COLORS = ['#6366F1', '#EC4899', '#00D2FF', '#F59E0B', '#10B981', '#A855F7'];
  const OPT_COLORS = {
    'opt-a': ['#E11D48', '#FB7185', '#FDA4AF', '#FFF1F2'],
    'opt-b': ['#0284C7', '#38BDF8', '#BAE6FD', '#F0F9FF'],
    'opt-c': ['#D97706', '#FBBF24', '#FDE68A', '#FFFBEB'],
    'opt-d': ['#059669', '#34D399', '#A7F3D0', '#ECFDF5']
  };

  class SparkParticle {
    constructor(x, y, palette = DEFAULT_COLORS) {
      this.x = x;
      this.y = y;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 7 + 2.5;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.friction = 0.93;
      this.gravity = 0.22;
      this.life = 1;
      this.decay = Math.random() * 0.025 + 0.02;
      this.size = Math.random() * 6 + 3.5;
      this.color = palette[Math.floor(Math.random() * palette.length)];
      this.shape = Math.random() > 0.4 ? 'circle' : 'star';
      this.rotation = Math.random() * Math.PI;
      this.rotationSpeed = (Math.random() - 0.5) * 0.2;
    }

    update() {
      this.vx *= this.friction;
      this.vy = this.vy * this.friction + this.gravity;
      this.x += this.vx;
      this.y += this.vy;
      this.rotation += this.rotationSpeed;
      this.life -= this.decay;
    }

    draw(ctx) {
      if (this.life <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.life);
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 8;

      if (this.shape === 'star') {
        const r = this.size;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          ctx.lineTo(Math.cos((i * Math.PI) / 2) * r, Math.sin((i * Math.PI) / 2) * r);
          ctx.lineTo(Math.cos((i * Math.PI) / 2 + Math.PI / 4) * (r * 0.35), Math.sin((i * Math.PI) / 2 + Math.PI / 4) * (r * 0.35));
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  class ShockwaveRing {
    constructor(x, y, color = '#6366F1') {
      this.x = x;
      this.y = y;
      this.radius = 8;
      this.maxRadius = 65;
      this.color = color;
      this.life = 1;
      this.decay = 0.045;
    }

    update() {
      this.radius += (this.maxRadius - this.radius) * 0.22;
      this.life -= this.decay;
    }

    draw(ctx) {
      if (this.life <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.life * 0.7);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = Math.max(1, 3.5 * this.life);
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function triggerBurst(x, y, palette = DEFAULT_COLORS, count = 12) {
    shockwaves.push(new ShockwaveRing(x, y, palette[0]));
    for (let i = 0; i < count; i++) {
      particles.push(new SparkParticle(x, y, palette));
    }
    if (!animFrameId) {
      loop();
    }
  }

  function loop() {
    ctx.clearRect(0, 0, width, height);

    // Update and draw shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.update();
      sw.draw(ctx);
      if (sw.life <= 0) {
        shockwaves.splice(i, 1);
      }
    }

    // Update and draw spark particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      p.draw(ctx);
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }

    if (particles.length > 0 || shockwaves.length > 0) {
      animFrameId = requestAnimationFrame(loop);
    } else {
      animFrameId = null;
    }
  }

  // Click & Touch listener
  window.addEventListener('pointerdown', (e) => {
    const x = e.clientX;
    const y = e.clientY;

    // Check if clicked element is an answer option button
    const optBtn = e.target.closest('.pc-option-btn, .btn-pc-primary, .btn-launch-game, .pc-avatar-opt, .action-btn');
    let palette = DEFAULT_COLORS;
    let count = 10;

    if (optBtn) {
      if (optBtn.classList.contains('opt-a')) palette = OPT_COLORS['opt-a'];
      else if (optBtn.classList.contains('opt-b')) palette = OPT_COLORS['opt-b'];
      else if (optBtn.classList.contains('opt-c')) palette = OPT_COLORS['opt-c'];
      else if (optBtn.classList.contains('opt-d')) palette = OPT_COLORS['opt-d'];
      count = 18;

      // Add physical hydraulic spring recoil to the button
      optBtn.animate([
        { transform: 'scale(1) translateY(0)' },
        { transform: 'scale(0.95) translateY(5px)' },
        { transform: 'scale(1.03) translateY(-2px)' },
        { transform: 'scale(1) translateY(0)' }
      ], {
        duration: 320,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      });
    }

    triggerBurst(x, y, palette, count);
    if (window.sounds && window.sounds.playClickPop) {
      window.sounds.playClickPop();
    }
  });

  window.cursorFx = {
    burst: triggerBurst
  };
})();
