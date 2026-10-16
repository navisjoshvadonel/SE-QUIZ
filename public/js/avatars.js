// public/js/avatars.js
// Bespoke Vector Software Engineering Gamer Insignias (Zero Emojis, 100% Unique)

(function(global) {
  'use strict';

  const AVATAR_DEFS = [
    {
      id: 'terminal-root',
      name: 'Terminal Root',
      role: 'Kernel Hacker',
      gradient: 'linear-gradient(135deg, #10B981, #047857)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_term" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#10B981"/>
              <stop offset="100%" stop-color="#047857"/>
            </linearGradient>
          </defs>
          <rect x="4" y="6" width="40" height="36" rx="8" fill="#0A121E" stroke="url(#g_term)" stroke-width="2.5"/>
          <path d="M4 14H44" stroke="#1E293B" stroke-width="2"/>
          <circle cx="9" cy="10" r="1.5" fill="#EF4444"/>
          <circle cx="14" cy="10" r="1.5" fill="#F59E0B"/>
          <circle cx="19" cy="10" r="1.5" fill="#10B981"/>
          <!-- Command Prompt >_ -->
          <path d="M12 21L19 26L12 31" stroke="#34D399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="23" y1="31" x2="33" y2="31" stroke="#6EE7B7" stroke-width="3" stroke-linecap="round"/>
        </svg>`
    },
    {
      id: 'quantum-core',
      name: 'Quantum Core',
      role: 'Low-Latency Architect',
      gradient: 'linear-gradient(135deg, #06B6D4, #3B82F6)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_quant" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#06B6D4"/>
              <stop offset="100%" stop-color="#3B82F6"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#081028" stroke="url(#g_quant)" stroke-width="2.5"/>
          <!-- Atom Orbit Rings -->
          <ellipse cx="24" cy="24" rx="15" ry="6" transform="rotate(-30 24 24)" stroke="#38BDF8" stroke-width="2" stroke-dasharray="2 2"/>
          <ellipse cx="24" cy="24" rx="15" ry="6" transform="rotate(30 24 24)" stroke="#818CF8" stroke-width="2"/>
          <circle cx="24" cy="24" r="5" fill="url(#g_quant)"/>
          <circle cx="24" cy="24" r="2.5" fill="#FFFFFF"/>
          <circle cx="12" cy="18" r="2" fill="#67E8F9"/>
          <circle cx="36" cy="30" r="2" fill="#93C5FD"/>
        </svg>`
    },
    {
      id: 'git-nexus',
      name: 'Git Nexus',
      role: 'Branch Grandmaster',
      gradient: 'linear-gradient(135deg, #F43F5E, #E11D48)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_git" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FB7185"/>
              <stop offset="100%" stop-color="#E11D48"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#1C0D17" stroke="url(#g_git)" stroke-width="2.5"/>
          <!-- Git Tree -->
          <line x1="16" y1="12" x2="16" y2="36" stroke="#FB7185" stroke-width="3" stroke-linecap="round"/>
          <path d="M16 26C22 26 24 20 32 20" stroke="#FDA4AF" stroke-width="3" stroke-linecap="round"/>
          <circle cx="16" cy="14" r="4" fill="#E11D48" stroke="#FFE4E6" stroke-width="2"/>
          <circle cx="16" cy="34" r="4" fill="#E11D48" stroke="#FFE4E6" stroke-width="2"/>
          <circle cx="32" cy="20" r="4" fill="#FB7185" stroke="#FFFFFF" stroke-width="2"/>
        </svg>`
    },
    {
      id: 'cyber-cpu',
      name: 'Silicon Circuit',
      role: 'Hardware & OS Guru',
      gradient: 'linear-gradient(135deg, #F59E0B, #D97706)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_cpu" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FBBF24"/>
              <stop offset="100%" stop-color="#D97706"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#1A1308" stroke="url(#g_cpu)" stroke-width="2.5"/>
          <!-- CPU Chip -->
          <rect x="13" y="13" width="22" height="22" rx="5" fill="#2E1F08" stroke="#F59E0B" stroke-width="2.5"/>
          <rect x="18" y="18" width="12" height="12" rx="3" fill="url(#g_cpu)"/>
          <!-- Pins -->
          <line x1="18" y1="8" x2="18" y2="13" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>
          <line x1="24" y1="8" x2="24" y2="13" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>
          <line x1="30" y1="8" x2="30" y2="13" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>
          <line x1="18" y1="35" x2="18" y2="40" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>
          <line x1="24" y1="35" x2="24" y2="40" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>
          <line x1="30" y1="35" x2="30" y2="40" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>
        </svg>`
    },
    {
      id: 'shield-sentinel',
      name: 'Zero-Trust Shield',
      role: 'SecOps Guardian',
      gradient: 'linear-gradient(135deg, #6366F1, #4F46E5)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_shld" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#818CF8"/>
              <stop offset="100%" stop-color="#4F46E5"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#0E122B" stroke="url(#g_shld)" stroke-width="2.5"/>
          <!-- Shield Geometry -->
          <path d="M24 10L35 15V24C35 31.5 24 37 24 37C24 37 13 31.5 13 24V15L24 10Z" fill="rgba(99, 102, 241, 0.25)" stroke="#818CF8" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M24 17V31" stroke="#A5B4FC" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="24" cy="22" r="3.5" fill="#FFFFFF"/>
        </svg>`
    },
    {
      id: 'neural-synapse',
      name: 'Neural Synapse',
      role: 'AI Model Engineer',
      gradient: 'linear-gradient(135deg, #EC4899, #8B5CF6)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_neur" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#F472B6"/>
              <stop offset="100%" stop-color="#A855F7"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#1C0F24" stroke="url(#g_neur)" stroke-width="2.5"/>
          <!-- Synapse Connections -->
          <line x1="15" y1="18" x2="33" y2="18" stroke="#F472B6" stroke-width="2"/>
          <line x1="15" y1="18" x2="24" y2="33" stroke="#C084FC" stroke-width="2"/>
          <line x1="33" y1="18" x2="24" y2="33" stroke="#C084FC" stroke-width="2"/>
          <circle cx="15" cy="18" r="4.5" fill="#EC4899" stroke="#FFFFFF" stroke-width="2"/>
          <circle cx="33" cy="18" r="4.5" fill="#8B5CF6" stroke="#FFFFFF" stroke-width="2"/>
          <circle cx="24" cy="33" r="5" fill="#A855F7" stroke="#FDF2F8" stroke-width="2"/>
        </svg>`
    },
    {
      id: 'prism-matrix',
      name: 'Prism Matrix',
      role: 'Clean Architecture Specialist',
      gradient: 'linear-gradient(135deg, #D946EF, #6366F1)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_prism" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#E879F9"/>
              <stop offset="100%" stop-color="#6366F1"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#160C26" stroke="url(#g_prism)" stroke-width="2.5"/>
          <!-- Diamond Shard -->
          <polygon points="24,9 37,24 24,39 11,24" fill="rgba(217, 70, 239, 0.2)" stroke="#E879F9" stroke-width="2.5" stroke-linejoin="round"/>
          <line x1="24" y1="9" x2="24" y2="39" stroke="#A5B4FC" stroke-width="1.8"/>
          <line x1="11" y1="24" x2="37" y2="24" stroke="#A5B4FC" stroke-width="1.8"/>
          <circle cx="24" cy="24" r="3.5" fill="#FFFFFF"/>
        </svg>`
    },
    {
      id: 'laser-apex',
      name: 'Laser Apex',
      role: 'DevOps Velocity Lead',
      gradient: 'linear-gradient(135deg, #84CC16, #10B981)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_apex" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#A3E635"/>
              <stop offset="100%" stop-color="#059669"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#0D1A10" stroke="url(#g_apex)" stroke-width="2.5"/>
          <!-- Apex Chevron Shards -->
          <path d="M12 32L24 14L36 32" stroke="#A3E635" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M17 34L24 24L31 34" stroke="#34D399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="24" cy="14" r="3" fill="#FFFFFF"/>
        </svg>`
    },
    {
      id: 'hyper-stream',
      name: 'Hyper Stream',
      role: 'Event Pipeline Architect',
      gradient: 'linear-gradient(135deg, #14B8A6, #0284C7)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_stream" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#2DD4BF"/>
              <stop offset="100%" stop-color="#0284C7"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#071924" stroke="url(#g_stream)" stroke-width="2.5"/>
          <!-- Dual Fast Velocity Waves -->
          <path d="M10 20C18 14 30 26 38 20" stroke="#2DD4BF" stroke-width="3.5" stroke-linecap="round"/>
          <path d="M10 28C18 22 30 34 38 28" stroke="#38BDF8" stroke-width="3.5" stroke-linecap="round"/>
          <circle cx="36" cy="20" r="2.5" fill="#FFFFFF"/>
          <circle cx="36" cy="28" r="2.5" fill="#FFFFFF"/>
        </svg>`
    },
    {
      id: 'binary-forge',
      name: 'Binary Forge',
      role: 'Full-Stack Mythic',
      gradient: 'linear-gradient(135deg, #F97316, #DC2626)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_forge" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FB923C"/>
              <stop offset="100%" stop-color="#DC2626"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#200B0B" stroke="url(#g_forge)" stroke-width="2.5"/>
          <!-- Energy Core -->
          <polygon points="24,10 36,17 36,31 24,38 12,31 12,17" fill="rgba(249, 115, 22, 0.2)" stroke="#FB923C" stroke-width="2.5" stroke-linejoin="round"/>
          <circle cx="24" cy="24" r="5" fill="url(#g_forge)"/>
          <circle cx="24" cy="24" r="2.5" fill="#FFF7ED"/>
        </svg>`
    },
    {
      id: 'telemetry-node',
      name: 'Telemetry Node',
      role: 'Observability & SRE Lead',
      gradient: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_tele" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#60A5FA"/>
              <stop offset="100%" stop-color="#1D4ED8"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#0A142E" stroke="url(#g_tele)" stroke-width="2.5"/>
          <!-- Radar Arcs -->
          <path d="M12 34A16 16 0 0 1 36 34" stroke="#60A5FA" stroke-width="2" stroke-linecap="round"/>
          <path d="M17 34A10 10 0 0 1 31 34" stroke="#93C5FD" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="24" cy="34" r="4.5" fill="#3B82F6" stroke="#FFFFFF" stroke-width="2"/>
          <line x1="24" y1="12" x2="24" y2="24" stroke="#60A5FA" stroke-width="2" stroke-dasharray="2 2"/>
          <circle cx="24" cy="12" r="3" fill="#BFDBFE"/>
        </svg>`
    },
    {
      id: 'infinity-flux',
      name: 'Infinity Loop',
      role: 'Algorithmic Grandmaster',
      gradient: 'linear-gradient(135deg, #8B5CF6, #C026D3)',
      render: (s) => `
        <svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="custom-avatar-svg">
          <defs>
            <linearGradient id="g_inf" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#A78BFA"/>
              <stop offset="100%" stop-color="#C026D3"/>
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="42" height="42" rx="12" fill="#180B2B" stroke="url(#g_inf)" stroke-width="2.5"/>
          <!-- Infinity Shape -->
          <path d="M16 24C16 20 20 20 24 24C28 28 32 28 32 24C32 20 28 20 24 24C20 28 16 28 16 24Z" stroke="url(#g_inf)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="16" cy="24" r="2.5" fill="#FFFFFF"/>
          <circle cx="32" cy="24" r="2.5" fill="#FFFFFF"/>
        </svg>`
    }
  ];

  // Helper map for fast lookup
  const AVATAR_MAP = new Map();
  AVATAR_DEFS.forEach(a => AVATAR_MAP.set(a.id, a));

  // Safe SVG rendering function
  function getAvatarSvg(avatarId, size = 32) {
    if (!avatarId) return AVATAR_DEFS[0].render(size);

    // Direct match
    if (AVATAR_MAP.has(avatarId)) {
      return AVATAR_MAP.get(avatarId).render(size);
    }

    // Fallback: If an old emoji or index or random string was passed, map deterministically
    let hash = 0;
    const str = String(avatarId);
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const safeIdx = Math.abs(hash) % AVATAR_DEFS.length;
    return AVATAR_DEFS[safeIdx].render(size);
  }

  function getAvatarMeta(avatarId) {
    if (AVATAR_MAP.has(avatarId)) {
      return AVATAR_MAP.get(avatarId);
    }
    return AVATAR_DEFS[0];
  }

  function getRandomAvatarId() {
    const idx = Math.floor(Math.random() * AVATAR_DEFS.length);
    return AVATAR_DEFS[idx].id;
  }

  // Export to window / global
  global.AVATAR_DEFS = AVATAR_DEFS;
  global.getAvatarSvg = getAvatarSvg;
  global.getAvatarMeta = getAvatarMeta;
  global.getRandomAvatarId = getRandomAvatarId;

})(typeof window !== 'undefined' ? window : this);
