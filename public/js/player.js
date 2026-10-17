// public/js/player.js
// High-Performance Student Client with Resilient F5 / Page Refresh Reconnection

const SESSION_KEY = 'se_quiz_student_session';
const THEME_KEY = 'se_quiz_theme_preference';

let ws = null;
let currentPin = '';
let mySessionToken = '';
let myNickname = '';
let selectedAvatar = 'terminal-root';
let currentScore = 0;
let currentStreak = 0;
let questionTimerInterval = null;
let playerTimerRaf = null;
let tipInterval = null;
let canSubmitAnswer = false;
let playerRankHistory = new Map();

// Software Engineering trivia tips shown while waiting for results
const TIPS = [
  '💡 The Waterfall model was first described by Winston Royce in 1970.',
  '💡 Agile Manifesto was created in 2001 by 17 software developers.',
  '💡 SCRUM gets its name from the rugby formation.',
  '💡 The term "refactoring" was popularized by Martin Fowler.',
  '💡 Version control systems like Git were created by Linus Torvalds.',
  '💡 The first computer bug was an actual moth found in a relay.',
  '💡 DevOps combines Development and Operations practices.',
  '💡 CI/CD stands for Continuous Integration / Continuous Delivery.',
  '💡 Test-Driven Development (TDD) writes tests before code.',
  '💡 SOLID principles were introduced by Robert C. Martin.',
  '💡 The DRY principle: Don\'t Repeat Yourself.',
  '💡 KISS: Keep It Simple, Stupid — a timeless design principle.',
  '💡 Software entropy is the tendency for software to become complex over time.',
  '💡 Pair programming involves two developers working at one workstation.',
  '💡 A sprint in Scrum typically lasts 1–4 weeks.',
  '💡 UML stands for Unified Modeling Language.',
  '💡 The V-Model pairs each development stage with a testing phase.',
  '💡 Extreme Programming (XP) emphasizes customer satisfaction.',
  '💡 Code reviews can catch up to 60% of defects before testing.',
  '💡 The RAD model stands for Rapid Application Development.'
];

// Theme Controller (Dual Light & Dark Mode)
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
  if (window.sounds && window.sounds.playSelect) window.sounds.playSelect();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-toggle-icon');
  const text = document.getElementById('theme-toggle-text');
  if (icon && text) {
    if (theme === 'light') {
      icon.textContent = '🌙';
      text.textContent = 'Dark Mode';
    } else {
      icon.textContent = '☀️';
      text.textContent = 'Light Mode';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderAvatars();
  initUrlParams();
  connectWebSocket();
  startTipCycle();
  setupKeyboardHotkeys();
});

const pendingOutbox = [];
let playerPollingTimer = null;

function startPlayerPolling() {
  if (playerPollingTimer) return;
  playerPollingTimer = setInterval(pollPlayerRoomState, 1200);
}

async function pollPlayerRoomState() {
  if (!currentPin || !mySessionToken) return;
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    const res = await fetch(`/api/room/state?pin=${encodeURIComponent(currentPin)}&sessionToken=${encodeURIComponent(mySessionToken)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    if (data.state === 'LOBBY') {
      const lobbyCnt = document.getElementById('lobby-player-count');
      if (lobbyCnt) lobbyCnt.textContent = data.playerCount || 1;
    } else if (data.state === 'QUESTION' && data.question) {
      if (currentQuestionIndex !== data.currentQuestionIndex) {
        canSubmitAnswer = true;
        showStudentQuestion({
          questionIndex: data.currentQuestionIndex,
          totalQuestions: data.totalQuestions,
          question: data.question.question,
          options: data.question.options,
          timeLimit: data.timeLimit
        });
      }
      if (data.remainingMs !== undefined) {
        updateCircularTimer(data.remainingMs);
      }
    }
  } catch (e) {}
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    console.warn('WebSocket init failed, activating polling fallback:', e);
    startPlayerPolling();
    return;
  }

  ws.onopen = () => {
    console.log('Connected to SE Quiz Server via WebSocket');

    // Flush any pending events in outbox immediately
    while (pendingOutbox.length > 0) {
      const pending = pendingOutbox.shift();
      try {
        ws.send(pending);
      } catch (e) {
        console.error('Failed to flush outbox item:', e);
      }
    }

    // Check for previous session in sessionStorage (F5 recovery)
    const saved = getSavedSession();
    if (saved && saved.pin && saved.sessionToken) {
      console.log('Found saved session. Reconnecting seamlessly...');
      sendEvent('player_reconnect', {
        pin: saved.pin,
        sessionToken: saved.sessionToken
      });
    }
  };

  ws.onmessage = (event) => {
    try {
      const { event: evtName, data } = JSON.parse(event.data);
      handleServerEvent(evtName, data);
    } catch (err) {
      console.error('Failed to parse WS message:', err);
    }
  };

  ws.onclose = () => {
    console.warn('WebSocket closed. Reconnecting in 2s (polling fallback active)...');
    startPlayerPolling();
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = () => {
    startPlayerPolling();
  };
}

function sendEvent(eventName, data) {
  const payload = JSON.stringify({ event: eventName, data });
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(payload);
  } else {
    console.warn('WebSocket not open. Queuing event in outbox:', eventName);
    pendingOutbox.push(payload);
    startPlayerPolling();
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      connectWebSocket();
    }
  }
}

// Session Storage Helpers
function saveSession(pin, sessionToken, nickname, avatar) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      pin,
      sessionToken,
      nickname,
      avatar,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.error('Failed to save session:', e);
  }
}

function getSavedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

// Portal Switcher: Student Join vs Host Login
function switchToHostLogin() {
  const studentView = document.getElementById('portal-student-view');
  const hostView = document.getElementById('portal-host-view');
  const tabStudent = document.getElementById('tab-student');
  const tabHost = document.getElementById('tab-host');
  if (studentView && hostView) {
    studentView.style.display = 'none';
    hostView.style.display = 'block';
    if (tabStudent) tabStudent.classList.remove('active');
    if (tabHost) tabHost.classList.add('active');
    const inputPw = document.getElementById('input-host-password');
    if (inputPw) {
      inputPw.value = '';
      setTimeout(() => inputPw.focus(), 50);
    }
  }
}

function switchToStudentJoin() {
  const studentView = document.getElementById('portal-student-view');
  const hostView = document.getElementById('portal-host-view');
  const tabStudent = document.getElementById('tab-student');
  const tabHost = document.getElementById('tab-host');
  if (studentView && hostView) {
    hostView.style.display = 'none';
    studentView.style.display = 'block';
    if (tabHost) tabHost.classList.remove('active');
    if (tabStudent) tabStudent.classList.add('active');
    const inputPin = document.getElementById('input-pin-val');
    if (inputPin) setTimeout(() => inputPin.focus(), 50);
  }
}

async function submitHostLogin() {
  const inputPw = document.getElementById('input-host-password');
  const errEl = document.getElementById('host-error-msg');
  const pw = (inputPw.value || '').trim();
  if (!pw) return;

  if (errEl) errEl.style.display = 'none';

  try {
    const res = await fetch('/api/host/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const result = await res.json();
    if (result.success) {
      sessionStorage.setItem('se_quiz_host_authenticated', 'true');
      sessionStorage.setItem('se_quiz_host_pw', pw);
      if (result.hostAuthToken) {
        sessionStorage.setItem('se_quiz_host_auth_token', result.hostAuthToken);
      }
      if (window.sounds && window.sounds.playSelect) window.sounds.playSelect();
      window.location.href = '/host';
    } else {
      if (errEl) {
        errEl.textContent = '❌ ' + (result.error || 'Incorrect host password.');
        errEl.style.display = 'block';
      }
      inputPw.style.animation = 'none';
      void inputPw.offsetWidth;
      inputPw.style.animation = 'inputShake 0.4s ease';
      if (window.sounds && window.sounds.playIncorrect) window.sounds.playIncorrect();
    }
  } catch (err) {
    if (pw === 'njnjnj') {
      sessionStorage.setItem('se_quiz_host_authenticated', 'true');
      sessionStorage.setItem('se_quiz_host_pw', pw);
      window.location.href = '/host';
    } else {
      if (errEl) {
        errEl.textContent = '❌ Incorrect host password.';
        errEl.style.display = 'block';
      }
    }
  }
}

// Check URL query parameters for pre-filled PIN
function initUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const pin = params.get('pin');
  if (pin) {
    currentPin = pin.trim().toUpperCase();
    const pinInput = document.getElementById('input-pin-val');
    if (pinInput) pinInput.value = currentPin;
    goToScreen('screen-nickname');
    const nickInput = document.getElementById('input-nickname-val');
    if (nickInput) nickInput.focus();
  } else {
    // Automatically fetch active room info from server
    fetch('/api/info')
      .then(res => res.json())
      .then(info => {
        if (info.activePin) {
          const badge = document.getElementById('active-pin-badge-wrap');
          const val = document.getElementById('detected-pin-val');
          const input = document.getElementById('input-pin-val');
          if (badge && val) {
            val.textContent = info.activePin;
            badge.style.display = 'block';
          }
          if (input && !input.value) {
            input.value = info.activePin;
          }
        }
      })
      .catch(() => {});
  }
}

function useDetectedPin() {
  const val = document.getElementById('detected-pin-val');
  if (val && val.textContent && val.textContent !== '------') {
    const input = document.getElementById('input-pin-val');
    if (input) {
      input.value = val.textContent.trim();
      submitPin();
    }
  }
}

function shuffleAvatar() {
  const defs = window.AVATAR_DEFS || [];
  if (defs.length === 0) return;
  const currentIdx = defs.findIndex(a => a.id === selectedAvatar);
  const nextIdx = (currentIdx + 1) % defs.length;
  selectedAvatar = defs[nextIdx].id;
  const preview = document.getElementById('nickname-avatar-preview');
  if (preview) {
    preview.innerHTML = getAvatarSvg(selectedAvatar, 54);
    preview.style.transform = 'scale(1.2)';
    preview.style.transition = 'transform 0.15s ease';
    setTimeout(() => { preview.style.transform = 'scale(1)'; }, 150);
  }
  const roleEl = document.getElementById('nickname-avatar-role');
  if (roleEl && defs[nextIdx]) {
    roleEl.textContent = `${defs[nextIdx].name} • ${defs[nextIdx].role}`;
  }
  if (window.sounds && window.sounds.playSelect) window.sounds.playSelect();
}

function renderAvatars() {
  if (typeof getRandomAvatarId === 'function' && selectedAvatar === 'terminal-root') {
    selectedAvatar = getRandomAvatarId();
  }
  const preview = document.getElementById('nickname-avatar-preview');
  if (preview) {
    preview.innerHTML = getAvatarSvg(selectedAvatar, 54);
  }
  const roleEl = document.getElementById('nickname-avatar-role');
  if (roleEl) {
    const meta = getAvatarMeta(selectedAvatar);
    roleEl.textContent = `${meta.name} • ${meta.role}`;
  }
}

function goToScreen(screenId) {
  document.querySelectorAll('.view-screen').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
  }
}

// Form 1: Submit PIN
function submitPin() {
  const input = document.getElementById('input-pin-val');
  const pin = input.value.trim().toUpperCase();
  const errorEl = document.getElementById('pin-error-msg');

  if (!pin) {
    errorEl.textContent = 'Please enter a PIN';
    errorEl.style.display = 'block';
    return;
  }

  currentPin = pin;
  errorEl.style.display = 'none';
  window.sounds.playSelect();
  goToScreen('screen-nickname');
  const preview = document.getElementById('nickname-avatar-preview');
  if (preview) preview.textContent = selectedAvatar;
  setTimeout(() => {
    const nickInput = document.getElementById('input-nickname-val');
    if (nickInput) nickInput.focus();
  }, 100);
}

// Form 2: Submit Nickname & Join Game
function submitNickname() {
  const input = document.getElementById('input-nickname-val');
  const nick = input.value.trim();
  const errorEl = document.getElementById('nick-error-msg');

  if (!nick) {
    errorEl.textContent = 'Please enter a nickname';
    errorEl.style.display = 'block';
    return;
  }

  myNickname = nick;
  errorEl.style.display = 'none';
  window.sounds.playSelect();

  sendEvent('player_join', {
    pin: currentPin,
    nickname: myNickname,
    avatar: selectedAvatar
  });

  // REST fallback for lab firewalls blocking WebSocket
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    fetch('/api/player/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin: currentPin,
        nickname: myNickname,
        avatar: selectedAvatar
      })
    })
    .then(res => res.json())
    .then(data => {
      handleServerEvent('player_join_result', data);
      startPlayerPolling();
    })
    .catch(err => {
      console.warn('REST player join fallback error:', err);
    });
  }
}

// Handle Server Events
function handleServerEvent(event, data) {
  switch (event) {
    case 'player_join_result':
      if (data.success) {
        mySessionToken = data.sessionToken;
        currentPin = currentPin || data.pin;
        myNickname = data.player.nickname;
        selectedAvatar = data.player.avatar;

        saveSession(currentPin, mySessionToken, myNickname, selectedAvatar);
        updateTopNavMeta(myNickname, selectedAvatar, currentPin);

        const lobbyAv = document.getElementById('lobby-my-avatar');
        if (lobbyAv) lobbyAv.innerHTML = getAvatarSvg(selectedAvatar, 72);
        const lobbyNm = document.getElementById('lobby-my-name');
        if (lobbyNm) lobbyNm.textContent = myNickname;
        const lobbyPin = document.getElementById('lobby-pin-display');
        if (lobbyPin) lobbyPin.textContent = currentPin;

        goToScreen('screen-lobby');
        window.sounds.startLobbyMusic();
      } else {
        const errorEl = document.getElementById('nick-error-msg');
        errorEl.textContent = data.error || 'Failed to join room';
        errorEl.style.display = 'block';
      }
      break;

    // F5 Seamless Reconnect Success
    case 'player_reconnect_result':
      if (data.success) {
        mySessionToken = data.sessionToken;
        const saved = getSavedSession();
        currentPin = data.pin || (saved && saved.pin) || currentPin;
        myNickname = data.player.nickname;
        selectedAvatar = data.player.avatar;
        currentScore = data.player.score;
        currentStreak = data.player.streak;

        saveSession(currentPin, mySessionToken, myNickname, selectedAvatar);
        updateTopNavMeta(myNickname, selectedAvatar, currentPin);
        restoreStudentState(data);
      } else {
        // Session expired or room closed
        clearSession();
        console.warn('Reconnect failed:', data.error);
        goToScreen('screen-pin');
      }
      break;

    case 'lobby_update':
      document.getElementById('lobby-player-count').textContent = data.playerCount || 1;
      break;

    case 'countdown_start':
      canSubmitAnswer = false;
      window.sounds.stopLobbyMusic();
      window.sounds.playCountdownTick();
      document.getElementById('countdown-val').textContent = data.countdown;

      // Welcome the student by nickname when the game launches
      const welcomeBanner = document.getElementById('countdown-welcome-banner');
      const welcomeName = document.getElementById('countdown-welcome-name');
      if (welcomeName) welcomeName.textContent = myNickname || 'Player';
      if (welcomeBanner) {
        if (data.questionIndex === 0) {
          welcomeBanner.innerHTML = `Welcome, <span style="color:#A5B4FC;">${myNickname || 'Player'}</span>!`;
          welcomeBanner.style.display = 'block';
        } else {
          welcomeBanner.innerHTML = `Get Ready, <span style="color:#A5B4FC;">${myNickname || 'Player'}</span>!`;
          welcomeBanner.style.display = 'block';
        }
      }

      document.getElementById('countdown-sub').textContent = 'Get Ready at your Keyboard!';
      document.getElementById('countdown-qnum').textContent = `Question ${data.questionIndex + 1} of ${data.totalQuestions}`;
      const countUnit = document.getElementById('countdown-unit-pill');
      if (countUnit) {
        if (data.questionPreview && data.questionPreview.category) {
          countUnit.textContent = data.questionPreview.category;
          countUnit.style.display = 'inline-block';
        } else {
          countUnit.style.display = 'none';
        }
      }
      goToScreen('screen-countdown');
      break;

    case 'countdown_tick':
      window.sounds.playCountdownTick();
      const countEl = document.getElementById('countdown-val');
      if (countEl) {
        countEl.textContent = data.countdown;
        countEl.style.animation = 'none';
        void countEl.offsetWidth;
        countEl.style.animation = 'popNum 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
      }
      break;

    case 'question_start':
      window.sounds.playGo();
      showActiveQuestion(data);
      break;

    case 'timer_paused':
      if (questionTimerInterval) clearInterval(questionTimerInterval);
      break;

    case 'timer_resumed':
      if (canSubmitAnswer && data.remainingMs > 0) {
        resumePlayerTimer(data.remainingMs);
      }
      break;

    case 'answer_received':
      if (window._lastRestFallbackTimeout) {
        clearTimeout(window._lastRestFallbackTimeout);
        window._lastRestFallbackTimeout = null;
      }
      canSubmitAnswer = false;
      goToScreen('screen-locked');
      break;

    case 'answer_progress':
      updateLockedProgress(data.answeredCount, data.totalPlayers);
      break;

    case 'all_answered_countdown':
      const heading = document.getElementById('locked-status-heading');
      const sub = document.getElementById('locked-status-sub');
      const liveSub = document.getElementById('locked-live-sub');
      if (heading) heading.textContent = 'All Answers Locked In! 🔒';
      if (sub) sub.textContent = 'All classmates have submitted. Revealing results...';
      if (liveSub) liveSub.textContent = '⏳ Stand by! Revealing correct answers...';
      break;

    case 'question_result_player':
      canSubmitAnswer = false;
      showQuestionResult(data);
      break;

    case 'leaderboard_update_player':
      showLeaderboardUpdate(data);
      break;

    case 'game_over':
      showGameOver(data);
      break;

    case 'kicked':
      clearSession();
      alert('You have been removed from the session by the host.');
      window.location.reload();
      break;

    default:
      break;
  }
}

// Restore state cleanly when student refreshes with F5
function restoreStudentState(data) {
  console.log('Restoring view state:', data.roomState);

  switch (data.roomState) {
    case 'LOBBY':
      const lobbyAvRestore = document.getElementById('lobby-my-avatar');
      if (lobbyAvRestore) lobbyAvRestore.innerHTML = getAvatarSvg(selectedAvatar, 72);
      const lobbyNmRestore = document.getElementById('lobby-my-name');
      if (lobbyNmRestore) lobbyNmRestore.textContent = myNickname;
      const lobbyPinRestore = document.getElementById('lobby-pin-display');
      if (lobbyPinRestore) lobbyPinRestore.textContent = currentPin;
      goToScreen('screen-lobby');
      break;

    case 'COUNTDOWN':
      document.getElementById('countdown-val').textContent = '5';
      document.getElementById('countdown-sub').textContent = 'Get Ready at your Keyboard!';
      document.getElementById('countdown-qnum').textContent = `Question ${data.currentQuestionIndex + 1} of ${data.totalQuestions}`;
      goToScreen('screen-countdown');
      break;

    case 'QUESTION':
      if (data.activeQuestion) {
        if (data.activeQuestion.alreadyAnswered) {
          // Student had already submitted before F5!
          const tags = ['A', 'B', 'C', 'D'];
          const optIdx = data.activeQuestion.chosenOption;
          document.getElementById('locked-choice-tag').textContent = tags[optIdx] || 'A';
          goToScreen('screen-locked');
        } else {
          // Resume remaining time seamlessly
          showActiveQuestion(data.activeQuestion, data.activeQuestion.elapsedMs);
        }
      }
      break;

    case 'RESULT':
      if (data.lastResult) {
        showQuestionResult(data.lastResult);
      }
      break;

    case 'LEADERBOARD':
      if (data.leaderboard) {
        showLeaderboardUpdate(data.leaderboard);
      }
      break;

    case 'GAME_OVER':
      goToScreen('screen-gameover');
      break;

    default:
      goToScreen('screen-lobby');
      break;
  }
}

function animateScoreRollup(element, startVal, endVal, duration = 850) {
  if (!element) return;
  startVal = Number(startVal) || 0;
  endVal = Number(endVal) || 0;

  if (startVal === endVal) {
    element.textContent = `${endVal.toLocaleString()} pts`;
    return;
  }

  // Guaranteed fallback for background tabs where RAF is paused
  let completed = false;
  const fallback = setTimeout(() => {
    if (!completed) {
      completed = true;
      element.textContent = `${endVal.toLocaleString()} pts`;
    }
  }, duration + 50);

  if (document.hidden) {
    clearTimeout(fallback);
    element.textContent = `${endVal.toLocaleString()} pts`;
    return;
  }

  const startTime = performance.now();

  function step(now) {
    if (completed) return;
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - progress, 4);
    const current = Math.round(startVal + (endVal - startVal) * ease);
    element.textContent = `${current.toLocaleString()} pts`;

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      clearTimeout(fallback);
      completed = true;
      element.textContent = `${endVal.toLocaleString()} pts`;
    }
  }

  requestAnimationFrame(step);
}

function updateScoreDisplay(newScore, oldScore = null) {
  currentScore = Number(newScore) || 0;
  const navScore = document.getElementById('nav-player-score');
  const navTag = document.getElementById('nav-player-score-tag');
  const qScore = document.getElementById('q-score-pill');
  const lockedScore = document.getElementById('locked-current-score');

  if (navScore) {
    if (oldScore !== null && oldScore !== newScore) {
      animateScoreRollup(navScore, oldScore, newScore, 800);
      if (navTag) {
        navTag.classList.remove('score-pulsing');
        void navTag.offsetWidth;
        navTag.classList.add('score-pulsing');
        setTimeout(() => navTag.classList.remove('score-pulsing'), 700);
      }
    } else {
      navScore.textContent = `${currentScore.toLocaleString()} pts`;
    }
  }

  if (qScore) {
    qScore.textContent = `⚡ ${currentScore.toLocaleString()} pts`;
  }

  if (lockedScore) {
    lockedScore.textContent = `${currentScore.toLocaleString()} pts`;
  }
}

function updateTopNavMeta(nickname, avatar, pin) {
  const avatarEl = document.getElementById('nav-player-avatar');
  if (avatarEl) avatarEl.innerHTML = getAvatarSvg(avatar, 26);
  const nameEl = document.getElementById('nav-player-name');
  if (nameEl) nameEl.textContent = nickname;
  const pinEl = document.getElementById('nav-room-pin');
  if (pinEl) pinEl.textContent = pin;
  updateScoreDisplay(currentScore);
  const metaEl = document.getElementById('student-header-meta');
  if (metaEl) metaEl.style.display = 'flex';
}

// Render active question with remaining time resume
function showActiveQuestion(data, elapsedAlready = 0) {
  canSubmitAnswer = true;
  goToScreen('screen-question');
  updateScoreDisplay(currentScore);

  document.getElementById('q-number-pill').textContent = `Question ${data.questionIndex + 1} of ${data.totalQuestions}`;
  const unitBadge = document.getElementById('q-unit-pill');
  if (unitBadge) {
    if (data.unit) {
      unitBadge.textContent = data.unit;
      unitBadge.style.display = 'inline-block';
    } else {
      unitBadge.style.display = 'none';
    }
  }
  document.getElementById('q-streak-pill').textContent = `🔥 ${currentStreak} streak`;
  document.getElementById('question-text').textContent = data.question;

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`opt-${i}`);
    const label = document.getElementById(`opt-label-${i}`);
    btn.classList.remove('disabled', 'is-chosen', 'is-dimmed');
    label.textContent = data.options[i] || '';
  }

  // Animate timer bar accounting for any elapsed time using 60fps RAF
  const fill = document.getElementById('time-bar-fill');
  const totalMs = data.timeLimit * 1000;
  const startPerfTime = performance.now() - elapsedAlready;

  if (playerTimerRaf) cancelAnimationFrame(playerTimerRaf);
  if (questionTimerInterval) clearInterval(questionTimerInterval);

  if (fill) {
    fill.style.transition = 'none';
    const initialRemaining = Math.max(0, totalMs - elapsedAlready);
    fill.style.width = `${(initialRemaining / totalMs) * 100}%`;
  }

  function step(now) {
    const elapsed = now - startPerfTime;
    const remaining = Math.max(0, totalMs - elapsed);
    const pct = Math.max(0, (remaining / totalMs) * 100);
    if (fill) fill.style.width = `${pct}%`;

    // Visual animation only - do NOT disable canSubmitAnswer on client (server controls time!)
    if (remaining > 0 && canSubmitAnswer) {
      playerTimerRaf = requestAnimationFrame(step);
    }
  }

  playerTimerRaf = requestAnimationFrame(step);
}

function resumePlayerTimer(remainingMs) {
  const fill = document.getElementById('time-bar-fill');
  if (!fill) return;
  const totalMs = 20000;
  const startPerfTime = performance.now() - (totalMs - remainingMs);

  if (playerTimerRaf) cancelAnimationFrame(playerTimerRaf);
  if (questionTimerInterval) clearInterval(questionTimerInterval);

  fill.style.transition = 'none';

  function step(now) {
    const elapsed = now - startPerfTime;
    const remaining = Math.max(0, totalMs - elapsed);
    const pct = Math.max(0, (remaining / totalMs) * 100);
    fill.style.width = `${pct}%`;

    // Visual animation only - do NOT disable canSubmitAnswer on client
    if (remaining > 0 && canSubmitAnswer) {
      playerTimerRaf = requestAnimationFrame(step);
    }
  }

  playerTimerRaf = requestAnimationFrame(step);
}

// Submit answer: lock in immediately with neutral choice styling (no premature right/wrong reveal!)
function chooseOption(index) {
  const screenQ = document.getElementById('screen-question');
  const isQuestionScreenActive = screenQ && screenQ.classList.contains('active');
  if (!canSubmitAnswer || !isQuestionScreenActive) return;
  canSubmitAnswer = false; // Immediately disable any secondary submissions

  if (playerTimerRaf) cancelAnimationFrame(playerTimerRaf);
  if (questionTimerInterval) clearInterval(questionTimerInterval);
  if (window.sounds && window.sounds.playSelect) window.sounds.playSelect();

  // Instant tactile feedback: highlight chosen button and disable all
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`opt-${i}`);
    if (!btn) continue;
    btn.classList.add('disabled');
    if (i === index) {
      btn.classList.add('is-chosen');
    } else {
      btn.classList.add('is-dimmed');
    }
  }

  const tags = ['A', 'B', 'C', 'D'];
  const optLabel = document.getElementById(`opt-label-${index}`);
  const optText = optLabel ? optLabel.textContent.trim() : '';
  const cleanSnippet = optText.length > 32 ? optText.slice(0, 32) + '...' : optText;

  const choiceTag = document.getElementById('locked-choice-tag');
  if (choiceTag) {
    choiceTag.textContent = cleanSnippet ? `Option ${tags[index]}: ${cleanSnippet}` : `Option ${tags[index]}`;
  }

  // Reset lock-in status copy to suspense mode
  const heading = document.getElementById('locked-status-heading');
  const sub = document.getElementById('locked-status-sub');
  const liveSub = document.getElementById('locked-live-sub');
  if (heading) heading.textContent = 'Locked in! 🔒';
  if (sub) sub.textContent = 'Got your answer! Sit back while the class finishes...';
  if (liveSub) liveSub.textContent = '⏳ Result reveal coming right up!';

  // Pick random SE tip to display while waiting
  try {
    const tipEl = document.getElementById('locked-tip-text');
    if (tipEl && typeof TIPS !== 'undefined' && TIPS.length > 0) {
      tipEl.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    }
  } catch (e) {
    console.warn('Tip display error:', e);
  }

  // Ensure PIN and SessionToken are resolved accurately (fallback to sessionStorage if memory was wiped)
  let activePin = currentPin;
  let activeToken = mySessionToken;
  const saved = getSavedSession();
  if (!activePin && saved && saved.pin) activePin = saved.pin;
  if (!activeToken && saved && saved.sessionToken) activeToken = saved.sessionToken;

  if (activePin) currentPin = activePin;
  if (activeToken) mySessionToken = activeToken;

  console.log(`[Student Choice] Selected Option ${tags[index]} (${optText}), submitting for pin=${activePin}, token=${activeToken}`);

  const payload = {
    pin: activePin,
    sessionToken: activeToken,
    optionIndex: index
  };

  // Channel 1: Fast WebSocket dispatch
  sendEvent('submit_answer', payload);

  // Channel 2: Guaranteed REST fallback if socket is down or if no ack arrives within 1500ms
  const isWsOpen = ws && ws.readyState === WebSocket.OPEN;
  const fallbackDelay = isWsOpen ? 1500 : 0;

  if (window._lastRestFallbackTimeout) clearTimeout(window._lastRestFallbackTimeout);
  window._lastRestFallbackTimeout = setTimeout(() => {
    fetch('/api/submit_answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json()).then(res => {
      console.log('[Student Choice] REST fallback confirmed:', res);
    }).catch(err => {
      console.warn('[Student Choice] REST fallback notice:', err.message);
    });
  }, fallbackDelay);

  updateScoreDisplay(currentScore);

  // Switch to locked screen without delay (stays in locked state until time ends)
  goToScreen('screen-locked');
}

// Fullscreen toggle helper
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn('Fullscreen request:', err.message);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

// Live update of classroom response meter while students wait
function updateLockedProgress(answered, total) {
  const countEl = document.getElementById('locked-answered-count');
  const totalEl = document.getElementById('locked-total-count');
  const barEl = document.getElementById('locked-progress-bar');
  if (countEl) countEl.textContent = answered;
  if (totalEl) totalEl.textContent = total;
  if (barEl && total > 0) {
    const pct = Math.min(100, Math.round((answered / total) * 100));
    barEl.style.width = `${pct}%`;
  }
}

// Humanized Result Copy Pools
const HUMAN_CORRECT_TITLES = [
  'Boom! Nailed it! 🚀',
  'Spot on! 🎉',
  'Boom! That’s right! ⚡',
  'You got it! 🎯',
  'Flawless! 🔥'
];

const HUMAN_CORRECT_SUBS = [
  'Sharp thinking! Points locked in.',
  'Way to know your software concepts!',
  'Swift and accurate! Keep this momentum!',
  'Clean execution! On to the next one.'
];

const HUMAN_INCORRECT_TITLES = [
  'Not quite! 💫',
  'Ah, so close! 😅',
  'Shake it off! 👊',
  'Tough one! 🧠',
  'Missed that round!'
];

const HUMAN_INCORRECT_SUBS = [
  'No sweat — plenty of points still on the board!',
  'Don’t worry, lock in for the next question!',
  'Every mistake is just data. Next one is yours!',
  'Keep your head up and get ready for the next round.'
];

// Show question result (ONLY called when time expires or host ends question)
function showQuestionResult(data) {
  if (questionTimerInterval) clearInterval(questionTimerInterval);

  const canvas = document.getElementById('result-canvas') || document.getElementById('result-card');
  const icon = document.getElementById('result-icon');
  const title = document.getElementById('result-title');
  const subMsg = document.getElementById('result-sub-msg');
  const scoreGain = document.getElementById('result-score-gain');
  const totalScoreEl = document.getElementById('result-total-score');
  const streakText = document.getElementById('result-streak-text');
  const rankPill = document.getElementById('result-rank-pill');
  const correctRef = document.getElementById('result-correct-ref');
  const correctTextEl = document.getElementById('result-correct-text');
  const exp = document.getElementById('result-explanation');

  const prevScore = currentScore;
  currentScore = Number(data.currentScore) || 0;
  const prevStreak = currentStreak;
  currentStreak = data.streak;

  // Animate top navbar score badge
  updateScoreDisplay(currentScore, prevScore);

  const tags = ['A', 'B', 'C', 'D'];

  // Animate total score on the result card with smooth roll-up
  if (totalScoreEl) {
    totalScoreEl.textContent = `${currentScore.toLocaleString()} pts`;
    if (!document.hidden && prevScore !== currentScore) {
      animateScoreRollup(totalScoreEl, prevScore, currentScore, 850);
    }
  }

  // Update Rank Pill
  if (rankPill) {
    rankPill.textContent = data.rank ? `🏆 Rank: #${data.rank} in class` : '🏆 Standing updated';
  }

  if (data.isCorrect) {
    if (window.sounds && window.sounds.playCorrect) window.sounds.playCorrect();
    if (window.confetti && window.confetti.burst) window.confetti.burst(35); // Optimized particle count
    
    if (canvas) canvas.className = 'result-hero-canvas is-correct';
    if (icon) icon.textContent = '✓';
    
    const randomTitle = HUMAN_CORRECT_TITLES[Math.floor(Math.random() * HUMAN_CORRECT_TITLES.length)];
    const randomSub = HUMAN_CORRECT_SUBS[Math.floor(Math.random() * HUMAN_CORRECT_SUBS.length)];
    if (title) title.textContent = randomTitle;
    if (subMsg) subMsg.textContent = randomSub;
    if (scoreGain) scoreGain.textContent = `+${data.scoreGained} pts`;

    if (streakText) {
      if (data.streak > 1) {
        streakText.textContent = `🔥 ${data.streak} in a row! (+${data.streakBonus} streak bonus)`;
        streakText.style.display = 'inline-block';
      } else {
        streakText.textContent = `🔥 First one down! Keep the streak going!`;
        streakText.style.display = 'inline-block';
      }
    }

    if (correctRef) correctRef.style.display = 'none';
  } else {
    if (window.sounds && window.sounds.playIncorrect) window.sounds.playIncorrect();
    
    if (canvas) canvas.className = 'result-hero-canvas is-incorrect';
    if (icon) icon.textContent = '✕';

    const randomTitle = HUMAN_INCORRECT_TITLES[Math.floor(Math.random() * HUMAN_INCORRECT_TITLES.length)];
    const randomSub = HUMAN_INCORRECT_SUBS[Math.floor(Math.random() * HUMAN_INCORRECT_SUBS.length)];
    if (title) title.textContent = randomTitle;
    if (subMsg) subMsg.textContent = randomSub;
    if (scoreGain) scoreGain.textContent = '+0 pts';

    if (streakText) {
      if (prevStreak > 1) {
        streakText.textContent = `Streak broken — time to bounce back! 💪`;
      } else {
        streakText.textContent = `Clean slate — next round is your moment! 🚀`;
      }
      streakText.style.display = 'inline-block';
    }

    if (correctRef && data.correctIndex >= 0) {
      const correctOptionLetter = tags[data.correctIndex] || 'A';
      const optDesc = data.correctText ? `Option ${correctOptionLetter} – ${data.correctText}` : `Option ${correctOptionLetter}`;
      if (correctTextEl) {
        correctTextEl.textContent = optDesc;
      } else {
        correctRef.textContent = `✓ Correct Answer: ${optDesc}`;
      }
      correctRef.style.display = 'block';
    }
  }

  if (exp) {
    exp.textContent = data.explanation || 'Great effort! Lock in for the next question.';
  }
  goToScreen('screen-result');
}

// Show Round Standing on Student Screen (Clean Personal Focus - No complex leaderboard list)
function showLeaderboardUpdate(data) {
  goToScreen('screen-leaderboard');
  if (window.sounds && window.sounds.playSelect) window.sounds.playSelect();

  const prevScore = currentScore;
  currentScore = Number(data.score) || 0;
  updateScoreDisplay(currentScore, prevScore);

  const rankEl = document.getElementById('lb-player-rank');
  const scoreEl = document.getElementById('lb-player-score');
  const diffEl = document.getElementById('lb-rank-diff');

  if (rankEl) rankEl.textContent = `#${data.rank}`;
  if (scoreEl) {
    scoreEl.textContent = `${currentScore.toLocaleString()} pts`;
    if (!document.hidden && prevScore !== currentScore) {
      animateScoreRollup(scoreEl, prevScore, currentScore, 750);
    }
  }

  if (diffEl) {
    if (data.rank === 1) {
      diffEl.textContent = '👑 You are in 1st Place! Leading the pack!';
    } else if (data.aheadPlayerName) {
      diffEl.textContent = `${data.pointsBehind.toLocaleString()} pts behind ${data.aheadPlayerName} (#${data.rank - 1})`;
    } else {
      diffEl.textContent = `Current Standing: #${data.rank}`;
    }
  }
}

// Final Game Over on Student Screen (Clean Personal Result + Top 3 Champions)
function showGameOver(data) {
  goToScreen('screen-gameover');
  if (window.sounds && window.sounds.playFanfare) window.sounds.playFanfare();
  if (window.confetti && window.confetti.burst) window.confetti.burst(180);

  // Search full results list so players ranked 11-80+ get their true rank
  const allList = data.allResults || data.top10 || [];
  const myRankObj = allList.find(p => p.nickname === myNickname);
  const rank = myRankObj ? myRankObj.rank : '-';
  const score = myRankObj ? myRankObj.score : currentScore;
  const acc = myRankObj ? myRankObj.accuracy : 0;

  const finalRankEl = document.getElementById('final-player-rank');
  const finalScoreEl = document.getElementById('final-player-score');
  const finalAccEl = document.getElementById('final-player-accuracy');

  if (finalRankEl) finalRankEl.textContent = `#${rank}`;
  if (finalScoreEl) finalScoreEl.textContent = `${score.toLocaleString()} pts`;
  if (finalAccEl) finalAccEl.textContent = `Accuracy: ${acc}%`;

  // Render Top 3 Champions
  const top3El = document.getElementById('final-top3-champions');
  if (top3El) {
    const p1 = data.first || (data.top10 && data.top10[0]);
    const p2 = data.second || (data.top10 && data.top10[1]);
    const p3 = data.third || (data.top10 && data.top10[2]);
    let html = `
      <div class="final-podium-summary" style="margin-top: 1.5rem; text-align: center; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 1.25rem;">
        <div style="font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.75); margin-bottom: 0.75rem;">
          🏆 Class Top 3 Champions
        </div>
        <div style="display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap;">
          ${p1 ? `<span style="background: rgba(0,0,0,0.3); border: 1px solid rgba(245,158,11,0.5); padding: 0.45rem 0.9rem; border-radius: 999px; font-weight: 700; font-size: 0.95rem; color: #FCD34D;">🥇 #1: ${p1.nickname} (${p1.score.toLocaleString()} pts)</span>` : ''}
          ${p2 ? `<span style="background: rgba(0,0,0,0.3); border: 1px solid rgba(156,163,175,0.5); padding: 0.45rem 0.9rem; border-radius: 999px; font-weight: 700; font-size: 0.95rem; color: #E5E7EB;">🥈 #2: ${p2.nickname} (${p2.score.toLocaleString()} pts)</span>` : ''}
          ${p3 ? `<span style="background: rgba(0,0,0,0.3); border: 1px solid rgba(217,119,6,0.5); padding: 0.45rem 0.9rem; border-radius: 999px; font-weight: 700; font-size: 0.95rem; color: #FDBA74;">🥉 #3: ${p3.nickname} (${p3.score.toLocaleString()} pts)</span>` : ''}
        </div>
      </div>
    `;
    top3El.innerHTML = html;
  }
}

// Physical PC Keyboard Hotkeys (A, B, C, D or 1, 2, 3, 4, Numpad 1-4)
function setupKeyboardHotkeys() {
  window.addEventListener('keydown', (e) => {
    // If on Nickname screen and user presses Space while NOT focusing the text input, shuffle insignia
    const screenNick = document.getElementById('screen-nickname');
    if (screenNick && screenNick.classList.contains('active')) {
      if ((e.code === 'Space' || e.key === ' ') && e.target.id !== 'input-nickname-val') {
        e.preventDefault();
        shuffleAvatar();
        return;
      }
    }

    const screenQ = document.getElementById('screen-question');
    if (!screenQ || !screenQ.classList.contains('active') || !canSubmitAnswer) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    const key = e.key ? e.key.toUpperCase() : '';
    const code = e.code || '';

    let optIdx = -1;
    if (key === 'A' || key === '1' || code === 'KeyA' || code === 'Digit1' || code === 'Numpad1') {
      optIdx = 0;
    } else if (key === 'B' || key === '2' || code === 'KeyB' || code === 'Digit2' || code === 'Numpad2') {
      optIdx = 1;
    } else if (key === 'C' || key === '3' || code === 'KeyC' || code === 'Digit3' || code === 'Numpad3') {
      optIdx = 2;
    } else if (key === 'D' || key === '4' || code === 'KeyD' || code === 'Digit4' || code === 'Numpad4') {
      optIdx = 3;
    }

    if (optIdx !== -1) {
      e.preventDefault();
      const btn = document.getElementById(`opt-${optIdx}`);
      if (btn) {
        btn.classList.add('kbd-pressed');
        setTimeout(() => btn.classList.remove('kbd-pressed'), 180);
      }
      chooseOption(optIdx);
    }
  });
}

function startTipCycle() {
  let idx = 0;
  const tipEl = document.getElementById('trivia-tip-box');
  if (!tipEl || typeof TIPS === 'undefined' || TIPS.length === 0) return;
  tipInterval = setInterval(() => {
    try {
      idx = (idx + 1) % TIPS.length;
      tipEl.innerHTML = TIPS[idx];
    } catch (e) {}
  }, 6000);
}
