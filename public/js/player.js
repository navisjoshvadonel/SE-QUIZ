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
let tipInterval = null;
let canSubmitAnswer = false;
let playerRankHistory = new Map();

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

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to SE Quiz Server');

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
    console.warn('Disconnected. Attempting auto-reconnect in 2s...');
    setTimeout(connectWebSocket, 2000);
  };
}

function sendEvent(eventName, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: eventName, data }));
  } else {
    console.warn('WebSocket not open. Event dropped:', eventName);
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

// Check URL query parameters for pre-filled PIN
function initUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const pin = params.get('pin');
  if (pin) {
    currentPin = pin.trim().toUpperCase();
    document.getElementById('input-pin-val').value = currentPin;
    goToScreen('screen-nickname');
    document.getElementById('input-nickname-val').focus();
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
        currentPin = (saved && saved.pin) || currentPin;
        myNickname = data.player.nickname;
        selectedAvatar = data.player.avatar;
        currentScore = data.player.score;
        currentStreak = data.player.streak;

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
      document.getElementById('countdown-val').textContent = data.countdown;
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
      document.getElementById('countdown-val').textContent = '3';
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

function updateTopNavMeta(nickname, avatar, pin) {
  const avatarEl = document.getElementById('nav-player-avatar');
  if (avatarEl) avatarEl.innerHTML = getAvatarSvg(avatar, 26);
  const nameEl = document.getElementById('nav-player-name');
  if (nameEl) nameEl.textContent = nickname;
  const pinEl = document.getElementById('nav-room-pin');
  if (pinEl) pinEl.textContent = pin;
  const metaEl = document.getElementById('student-header-meta');
  if (metaEl) metaEl.style.display = 'flex';
}

// Render active question with remaining time resume
function showActiveQuestion(data, elapsedAlready = 0) {
  canSubmitAnswer = true;
  goToScreen('screen-question');

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

  // Animate timer bar accounting for any elapsed time
  const fill = document.getElementById('time-bar-fill');
  fill.style.transition = 'none';

  const totalMs = data.timeLimit * 1000;
  const initialRemaining = Math.max(0, totalMs - elapsedAlready);
  fill.style.width = `${(initialRemaining / totalMs) * 100}%`;

  const startTime = Date.now() - elapsedAlready;

  if (questionTimerInterval) clearInterval(questionTimerInterval);

  questionTimerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, totalMs - elapsed);
    const pct = (remaining / totalMs) * 100;
    fill.style.transition = 'width 0.1s linear';
    fill.style.width = `${pct}%`;

    if (remaining <= 0) {
      clearInterval(questionTimerInterval);
      canSubmitAnswer = false;
    }
  }, 100);
}

function resumePlayerTimer(remainingMs) {
  const fill = document.getElementById('time-bar-fill');
  if (!fill) return;
  const totalMs = 20000;
  const startTime = Date.now() - (totalMs - remainingMs);

  if (questionTimerInterval) clearInterval(questionTimerInterval);

  questionTimerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, totalMs - elapsed);
    const pct = (remaining / totalMs) * 100;
    fill.style.transition = 'width 0.1s linear';
    fill.style.width = `${pct}%`;

    if (remaining <= 0) {
      clearInterval(questionTimerInterval);
      canSubmitAnswer = false;
    }
  }, 100);
}

// Submit answer: lock in immediately with neutral choice styling (no premature right/wrong reveal!)
function chooseOption(index) {
  if (!canSubmitAnswer) return;
  canSubmitAnswer = false;

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
  const tipEl = document.getElementById('locked-tip-text');
  if (tipEl && TIPS.length > 0) {
    tipEl.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  }

  sendEvent('submit_answer', {
    pin: currentPin,
    sessionToken: mySessionToken,
    optionIndex: index
  });

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
  const streakText = document.getElementById('result-streak-text');
  const correctRef = document.getElementById('result-correct-ref');
  const correctTextEl = document.getElementById('result-correct-text');
  const exp = document.getElementById('result-explanation');

  currentScore = data.currentScore;
  const prevStreak = currentStreak;
  currentStreak = data.streak;

  const tags = ['A', 'B', 'C', 'D'];

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

// Show leaderboard
function showLeaderboardUpdate(data) {
  goToScreen('screen-leaderboard');
  window.sounds.playSelect();

  document.getElementById('lb-player-rank').textContent = `#${data.rank}`;
  document.getElementById('lb-player-score').textContent = `${data.score.toLocaleString()} pts`;

  const diffEl = document.getElementById('lb-rank-diff');
  if (data.rank === 1) {
    diffEl.textContent = '👑 You are in 1st Place! Leading the pack!';
  } else if (data.aheadPlayerName) {
    diffEl.textContent = `${data.pointsBehind.toLocaleString()} pts behind ${data.aheadPlayerName} (#${data.rank - 1})`;
  } else {
    diffEl.textContent = `Current Position: #${data.rank}`;
  }

  const listEl = document.getElementById('lb-top10-list') || document.getElementById('lb-top5-list');
  listEl.innerHTML = '';

  const playersToShow = data.top10 || data.top5 || [];

  playersToShow.forEach((tp, idx) => {
    const isMe = tp.nickname === myNickname;
    const row = document.createElement('div');
    const rankClass = tp.rank <= 3 ? ` rank-${tp.rank}` : '';
    row.className = `pc-lb-row${rankClass} ${isMe ? 'highlight my-row' : ''} animated-swap`;
    row.style.animationDelay = `${idx * 0.08}s`;

    let placePill = '';
    if (tp.rank === 1) {
      placePill = `<span class="host-place-pill place-1"><span class="crown-icon">👑</span> 1st Place</span>`;
    } else if (tp.rank === 2) {
      placePill = `<span class="host-place-pill place-2">🥈 2nd Place</span>`;
    } else if (tp.rank === 3) {
      placePill = `<span class="host-place-pill place-3">🥉 3rd Place</span>`;
    } else {
      placePill = `<span class="host-place-pill place-normal">#${tp.rank} • ${tp.rank}th Place</span>`;
    }

    // Calculate rank swap delta (▲ +2, ▼ -1, ★ NEW, —)
    const prev = playerRankHistory.get(tp.nickname);
    let deltaBadge = '';
    const prevScore = prev ? prev.score : 0;

    if (prev) {
      const delta = prev.rank - tp.rank;
      if (delta > 0) {
        deltaBadge = `<span class="rank-delta up">▲ +${delta}</span>`;
      } else if (delta < 0) {
        deltaBadge = `<span class="rank-delta down">▼ ${Math.abs(delta)}</span>`;
      } else {
        deltaBadge = `<span class="rank-delta same">—</span>`;
      }
    } else {
      deltaBadge = `<span class="rank-delta new">★ NEW</span>`;
    }
    playerRankHistory.set(tp.nickname, { rank: tp.rank, score: tp.score });

    const streakHtml = tp.streak > 1 ? `<span class="lb-streak-pill">🔥 ${tp.streak}</span>` : '';

    row.innerHTML = `
      <div class="lb-left">
        ${placePill}
        ${deltaBadge}
        <span class="lb-avatar" style="display: inline-flex; align-items: center;">${getAvatarSvg(tp.avatar, 28)}</span>
        <span class="lb-name">${tp.nickname} ${isMe ? '<strong style="color: #6366F1;">(You)</strong>' : ''}</span>
        ${streakHtml}
      </div>
      <div class="lb-score" id="player-score-num-${idx}">${prevScore.toLocaleString()} pts</div>
    `;
    listEl.appendChild(row);

    setTimeout(() => {
      const scoreEl = document.getElementById(`player-score-num-${idx}`);
      if (scoreEl) {
        animatePlayerScoreRollup(scoreEl, prevScore, tp.score, 750);
      }
    }, idx * 75);
  });
}

function animatePlayerScoreRollup(element, startVal, endVal, duration = 750) {
  if (startVal === endVal) {
    element.textContent = `${endVal.toLocaleString()} pts`;
    return;
  }
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startVal + (endVal - startVal) * ease);
    element.textContent = `${current.toLocaleString()} pts`;
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

// Final Game Over
function showGameOver(data) {
  goToScreen('screen-gameover');
  window.sounds.playFanfare();
  window.confetti.burst(180);

  const myRankObj = data.top10.find(p => p.nickname === myNickname);
  const rank = myRankObj ? myRankObj.rank : '-';
  const score = myRankObj ? myRankObj.score : currentScore;
  const acc = myRankObj ? myRankObj.accuracy : 0;

  document.getElementById('final-player-rank').textContent = `#${rank}`;
  document.getElementById('final-player-score').textContent = `${score.toLocaleString()} pts`;
  document.getElementById('final-player-accuracy').textContent = `Accuracy: ${acc}%`;

  const top10El = document.getElementById('final-top10-list');
  top10El.innerHTML = '';

  data.top10.forEach((tp) => {
    const isMe = tp.nickname === myNickname;
    const row = document.createElement('div');
    row.className = `pc-lb-row ${isMe ? 'highlight' : ''}`;

    let rankIcon = `#${tp.rank}`;
    if (tp.rank === 1) rankIcon = '🥇 #1';
    else if (tp.rank === 2) rankIcon = '🥈 #2';
    else if (tp.rank === 3) rankIcon = '🥉 #3';

    row.innerHTML = `
      <div class="lb-left">
        <span class="lb-rank" style="width: 50px;">${rankIcon}</span>
        <span class="lb-avatar" style="display: inline-flex; align-items: center;">${getAvatarSvg(tp.avatar, 28)}</span>
        <span class="lb-name">${tp.nickname} ${isMe ? '(You)' : ''}</span>
      </div>
      <div class="lb-score">${tp.score.toLocaleString()} pts (${tp.accuracy}%)</div>
    `;
    top10El.appendChild(row);
  });
}

// Physical PC Keyboard Hotkeys (A, B, C, D or 1, 2, 3, 4)
function setupKeyboardHotkeys() {
  window.addEventListener('keydown', (e) => {
    const screenQ = document.getElementById('screen-question');
    if (!screenQ || !screenQ.classList.contains('active') || !canSubmitAnswer) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toUpperCase();
    if (key === 'A' || key === '1') {
      chooseOption(0);
    } else if (key === 'B' || key === '2') {
      chooseOption(1);
    } else if (key === 'C' || key === '3') {
      chooseOption(2);
    } else if (key === 'D' || key === '4') {
      chooseOption(3);
    }
  });
}

function startTipCycle() {
  let idx = 0;
  const tipEl = document.getElementById('trivia-tip-box');
  tipInterval = setInterval(() => {
    if (tipEl) {
      idx = (idx + 1) % TIPS.length;
      tipEl.innerHTML = TIPS[idx];
    }
  }, 6000);
}
