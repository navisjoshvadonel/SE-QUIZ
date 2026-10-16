// public/js/host.js
// Native WebSocket Client for SE Quiz Arena Host / Lab Projector View with Reconnect & CSV Export

const HOST_SESSION_KEY = 'se_quiz_host_session';
const THEME_KEY = 'se_quiz_theme_preference';

let ws = null;
let currentPin = '';
let currentHostToken = '';
let currentQuestionIndex = 0;
let totalQuestions = 50;
let totalPlayers = 0;
let hostTimerInterval = null;
let isLastQuestion = false;
let finalResultsCache = null;
let hostRankHistory = new Map();
let isHostPaused = false;
let hostRemainingMs = 0;
let hostTimeLimitSec = 20;
let autoLeaderboardTimer = null;
let autoLeaderboardInterval = null;
let lastQuestionResultCache = null;

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
      text.textContent = 'Dark';
    } else {
      icon.textContent = '☀️';
      text.textContent = 'Light';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadQuestionList();
  connectHostWebSocket();
  setupKeyboardShortcuts();
});

function connectHostWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Host connected to server');

    // Check if host had an active session (F5 recovery)
    const saved = getSavedHostSession();
    if (saved && saved.pin && saved.hostToken) {
      console.log('Found saved host session. Reconnecting host...');
      sendHostEvent('host_reconnect', {
        pin: saved.pin,
        hostToken: saved.hostToken
      });
    } else {
      sendHostEvent('host_create_room', {});
    }
  };

  ws.onmessage = (event) => {
    try {
      const { event: evtName, data } = JSON.parse(event.data);
      handleHostEvent(evtName, data);
    } catch (err) {
      console.error('Host failed to parse WS message:', err);
    }
  };

  ws.onclose = () => {
    console.warn('Host disconnected. Reconnecting in 2s...');
    setTimeout(connectHostWebSocket, 2000);
  };
}

function sendHostEvent(eventName, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: eventName, data }));
  }
}

function saveHostSession(pin, hostToken) {
  try {
    sessionStorage.setItem(HOST_SESSION_KEY, JSON.stringify({ pin, hostToken }));
  } catch (e) {}
}

function getSavedHostSession() {
  try {
    const raw = sessionStorage.getItem(HOST_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearHostSession() {
  try {
    sessionStorage.removeItem(HOST_SESSION_KEY);
  } catch (e) {}
}

function showHostScreen(screenId) {
  document.querySelectorAll('.host-view').forEach(el => {
    el.style.display = 'none';
    el.classList.remove('active');
  });
  const target = document.getElementById(screenId);
  if (target) {
    target.style.display = 'flex';
    target.classList.add('active');
  }

  // Manage Question Controls Toolbar visibility
  const toolbar = document.getElementById('host-controls-toolbar');
  if (toolbar) {
    if (screenId === 'host-screen-lobby' || screenId === 'host-screen-podium') {
      toolbar.style.display = 'none';
    } else {
      toolbar.style.display = 'flex';
    }
  }
}

// Handle Server Events
function handleHostEvent(event, data) {
  switch (event) {
    case 'host_created':
      currentPin = data.pin;
      currentHostToken = data.hostToken;
      totalQuestions = data.totalQuestions || 50;
      saveHostSession(currentPin, currentHostToken);

      document.getElementById('host-pin-val').textContent = currentPin;
      document.getElementById('host-preview-pin').textContent = currentPin;
      fetchNetworkInfo();
      window.sounds.startLobbyMusic();
      showHostScreen('host-screen-lobby');
      break;

    case 'host_reconnect_result':
      if (data.success) {
        currentPin = data.pin;
        currentHostToken = data.hostToken;
        totalQuestions = data.totalQuestions || 50;
        document.getElementById('host-pin-val').textContent = currentPin;
        document.getElementById('host-preview-pin').textContent = currentPin;
        fetchNetworkInfo();

        if (data.state === 'QUESTION' && data.currentQuestion) {
          showQuestion({
            questionIndex: data.currentQuestionIndex,
            totalQuestions: data.totalQuestions,
            question: data.currentQuestion.question,
            options: data.currentQuestion.options,
            timeLimit: data.currentQuestion.timeLimit
          });
        } else if (data.state === 'LOBBY') {
          showHostScreen('host-screen-lobby');
        }
      } else {
        clearHostSession();
        sendHostEvent('host_create_room', {});
      }
      break;

    case 'lobby_update':
      updateLobby(data);
      break;

    case 'countdown_start':
      window.sounds.stopLobbyMusic();
      window.sounds.playCountdownTick();
      showCountdown(data);
      break;

    case 'countdown_tick':
      window.sounds.playCountdownTick();
      const countEl = document.getElementById('host-countdown-num');
      countEl.textContent = data.countdown;
      countEl.style.animation = 'none';
      void countEl.offsetWidth;
      countEl.style.animation = 'popNum 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) infinite';
      break;

    case 'timer_paused':
      isHostPaused = true;
      updatePauseButtonUI(true);
      if (hostTimerInterval) clearInterval(hostTimerInterval);
      break;

    case 'timer_resumed':
      isHostPaused = false;
      updatePauseButtonUI(false);
      resumeHostCircularTimer(data.remainingMs);
      break;

    case 'question_start':
      window.sounds.playGo();
      showQuestion(data);
      break;

    case 'answer_progress':
      updateAnswerProgress(data);
      break;

    case 'question_result_host':
      showQuestionResult(data);
      break;

    case 'leaderboard_update_host':
      showLeaderboard(data);
      break;

    case 'game_over':
      stopAutoLeaderboardAdvance();
      showPodium(data);
      break;

    default:
      break;
  }
}

// Fetch 50 questions metadata to populate Host Question Jump Selector
async function loadQuestionList() {
  try {
    const res = await fetch('/api/questions');
    const info = await res.json();
    const select = document.getElementById('host-question-selector');
    if (!select || !info.questions) return;
    
    select.innerHTML = '<option value="">Jump to Question (1–50)...</option>';
    info.questions.forEach((q, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      const cleanQ = q.question.replace(/^\[[^\]]+\]\s*/, '');
      opt.textContent = `Q${idx + 1}: ${cleanQ.length > 50 ? cleanQ.slice(0, 50) + '...' : cleanQ}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.warn('Could not populate question select dropdown:', err);
  }
}

// Fetch clean join link for students (Humanized, no http/https protocol)
async function fetchNetworkInfo() {
  try {
    const res = await fetch('/api/info');
    const info = await res.json();
    const cleanDomain = info.joinDomain || window.location.host;
    const urlEl = document.getElementById('host-pc-join-url');
    if (urlEl) urlEl.textContent = cleanDomain.replace(/^https?:\/\//i, '');
  } catch (e) {
    const urlEl = document.getElementById('host-pc-join-url');
    if (urlEl) urlEl.textContent = window.location.host.replace(/^https?:\/\//i, '');
  }
}

// Update lobby student list & count
function updateLobby(data) {
  totalPlayers = data.playerCount || 0;
  document.getElementById('host-player-count').textContent = totalPlayers;

  const grid = document.getElementById('host-player-grid');
  grid.innerHTML = '';

  if (!data.players || data.players.length === 0) {
    grid.innerHTML = `
      <div id="lobby-empty-placeholder" class="empty-arena-state">
        <div class="empty-icon">💻</div>
        <h3>Waiting for students to join from PC...</h3>
        <p>Direct students to enter the URL & PIN above on their desktop browsers</p>
      </div>
    `;
    return;
  }

  data.players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'student-chip';
    chip.title = 'Click to kick student from lobby';
    chip.innerHTML = `
      <span class="student-chip-avatar" style="display:inline-flex; align-items:center;">${getAvatarSvg(p.avatar, 22)}</span>
      <span class="student-chip-name">${p.nickname}</span>
    `;
    chip.onclick = () => {
      if (confirm(`Remove "${p.nickname}" from lobby?`)) {
        sendHostEvent('host_kick_player', {
          pin: currentPin,
          hostToken: currentHostToken,
          sessionToken: p.sessionToken
        });
      }
    };
    grid.appendChild(chip);
  });
}

// Host initiates game
function hostStartGame() {
  if (totalPlayers === 0) {
    alert('Wait for at least 1 student to join before starting!');
    return;
  }
  window.sounds.playSelect();
  sendHostEvent('host_start_game', {
    pin: currentPin,
    hostToken: currentHostToken
  });
}

// 3-2-1 Countdown screen
function showCountdown(data) {
  stopAutoLeaderboardAdvance();
  showHostScreen('host-screen-countdown');
  currentQuestionIndex = data.questionIndex;
  document.getElementById('host-countdown-num').textContent = data.countdown;
  document.getElementById('host-countdown-qnum').textContent = `Question ${data.questionIndex + 1} of ${data.totalQuestions}`;
  document.getElementById('host-countdown-preview-title').textContent = data.questionPreview.text.length > 55 
    ? data.questionPreview.text.slice(0, 55) + '...' 
    : data.questionPreview.text;
  
  const unitBadge = document.getElementById('host-countdown-unit-pill');
  if (unitBadge) {
    if (data.questionPreview && data.questionPreview.category) {
      unitBadge.textContent = data.questionPreview.category;
      unitBadge.style.display = 'inline-block';
    } else {
      unitBadge.style.display = 'none';
    }
  }

  // Update question selector
  const select = document.getElementById('host-question-selector');
  if (select) select.value = data.questionIndex;
}

// Active question presentation (Question + Options clearly displayed)
function showQuestion(data) {
  stopAutoLeaderboardAdvance();
  showHostScreen('host-screen-question');
  currentQuestionIndex = data.questionIndex;
  isLastQuestion = (data.questionIndex + 1) >= data.totalQuestions;
  isHostPaused = false;
  updatePauseButtonUI(false);

  // Update question jump select
  const select = document.getElementById('host-question-selector');
  if (select) select.value = data.questionIndex;

  document.getElementById('host-q-index-pill').textContent = `Question ${data.questionIndex + 1} of ${data.totalQuestions}`;
  
  const unitBadge = document.getElementById('host-q-unit-pill');
  if (unitBadge) {
    if (data.unit) {
      unitBadge.textContent = data.unit;
      unitBadge.style.display = 'inline-block';
    } else {
      unitBadge.style.display = 'none';
    }
  }

  document.getElementById('host-question-title').textContent = data.question;
  document.getElementById('host-answered-count').textContent = '0';
  document.getElementById('host-total-players-count').textContent = totalPlayers;

  // Render the 4 Option Cards with clear text
  for (let i = 0; i < 4; i++) {
    const card = document.getElementById(`host-opt-${i}`);
    const textEl = document.getElementById(`host-opt-text-${i}`);
    if (card) card.classList.remove('dimmed', 'correct-glow');
    if (textEl) textEl.textContent = (data.options && data.options[i]) ? data.options[i] : `Option ${['A','B','C','D'][i]}`;
  }

  // Circular SVG timer animation
  hostTimeLimitSec = data.timeLimit || 20;
  hostRemainingMs = hostTimeLimitSec * 1000;
  resumeHostCircularTimer(hostRemainingMs);
}

function resumeHostCircularTimer(remainingMs) {
  const circleBar = document.getElementById('host-timer-bar');
  const timerNum = document.getElementById('host-timer-num');
  const totalMs = hostTimeLimitSec * 1000;
  const circumference = 2 * Math.PI * 44; // 276.46
  
  if (circleBar) {
    circleBar.style.strokeDasharray = `${circumference}`;
  }

  const startTime = Date.now() - (totalMs - remainingMs);

  if (hostTimerInterval) clearInterval(hostTimerInterval);

  hostTimerInterval = setInterval(() => {
    if (isHostPaused) return;

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, totalMs - elapsed);
    hostRemainingMs = remaining;
    const sec = Math.ceil(remaining / 1000);
    if (timerNum) timerNum.textContent = sec;

    const ratio = remaining / totalMs;
    const offset = circumference * (1 - ratio);
    if (circleBar) {
      circleBar.style.strokeDashoffset = `${offset}`;
      if (ratio < 0.25) {
        circleBar.style.stroke = '#EF4444';
      } else if (ratio < 0.5) {
        circleBar.style.stroke = '#F59E0B';
      } else {
        circleBar.style.stroke = '#4F46E5';
      }
    }

    if (remaining <= 0) {
      clearInterval(hostTimerInterval);
    }
  }, 100);
}

function updateAnswerProgress(data) {
  document.getElementById('host-answered-count').textContent = data.answeredCount;
  document.getElementById('host-total-players-count').textContent = data.totalPlayers;
}

// Show Question Result:
// "the question as well as options must be there"
// "after time limit ends the leaderboard must be coming"
function showQuestionResult(data) {
  if (hostTimerInterval) clearInterval(hostTimerInterval);
  stopAutoLeaderboardAdvance();
  lastQuestionResultCache = data;

  window.sounds.playCorrect();
  showHostScreen('host-screen-result');

  // Question metadata & text
  const qPill = document.getElementById('host-result-q-pill');
  if (qPill) qPill.textContent = `Question ${data.questionIndex + 1} of ${data.totalQuestions}`;

  const unitPill = document.getElementById('host-result-unit-pill');
  if (unitPill) {
    if (data.unit) {
      unitPill.textContent = data.unit;
      unitPill.style.display = 'inline-block';
    } else {
      unitPill.style.display = 'none';
    }
  }

  const titleEl = document.getElementById('host-result-question-title');
  if (titleEl) titleEl.textContent = data.question || '';

  const expEl = document.getElementById('host-result-explanation');
  if (expEl) expEl.textContent = data.explanation || '';

  // Render 4 options cards with option text, correct answer highlight, and vote distribution
  const totalVotes = data.totalAnswered || data.distribution.reduce((a, b) => a + b, 0);

  for (let i = 0; i < 4; i++) {
    const card = document.getElementById(`result-opt-${i}`);
    const textEl = document.getElementById(`result-opt-text-${i}`);
    const badgeEl = document.getElementById(`result-badge-${i}`);
    const votesEl = document.getElementById(`result-votes-${i}`);
    const pctEl = document.getElementById(`result-pct-${i}`);
    const barFill = document.getElementById(`result-bar-${i}`);

    const count = (data.distribution && data.distribution[i]) ? data.distribution[i] : 0;
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

    if (textEl) {
      textEl.textContent = (data.options && data.options[i]) ? data.options[i] : `Option ${['A','B','C','D'][i]}`;
    }
    if (votesEl) votesEl.textContent = count;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (barFill) barFill.style.width = `${pct}%`;

    if (card) {
      card.classList.remove('is-correct', 'is-dimmed');
      if (i === data.correctIndex) {
        card.classList.add('is-correct');
        if (badgeEl) badgeEl.style.display = 'inline-flex';
      } else {
        card.classList.add('is-dimmed');
        if (badgeEl) badgeEl.style.display = 'none';
      }
    }
  }

  // Question & all 4 options are shown cleanly.
  // Wait for Host to press Space or Enter (or click) to trigger animated Leaderboard
  stopAutoLeaderboardAdvance();
}

function startAutoLeaderboardAdvance(seconds = 3.5) {
  // Disabled - Kahoot flow waits for Host Space/Enter key
  stopAutoLeaderboardAdvance();
}

function stopAutoLeaderboardAdvance() {
  if (autoLeaderboardTimer) {
    clearTimeout(autoLeaderboardTimer);
    autoLeaderboardTimer = null;
  }
  if (autoLeaderboardInterval) {
    clearInterval(autoLeaderboardInterval);
    autoLeaderboardInterval = null;
  }
}

function hostNextAction() {
  stopAutoLeaderboardAdvance();
  window.sounds.playSelect();
  sendHostEvent('host_show_leaderboard', {
    pin: currentPin,
    hostToken: currentHostToken
  });
}

// Show Leaderboard:
// "leaderboard , then standing of top 10 studentsd"
function showLeaderboard(data) {
  stopAutoLeaderboardAdvance();
  showHostScreen('host-screen-leaderboard');
  window.sounds.playSelect();

  currentQuestionIndex = data.questionIndex;
  isLastQuestion = (data.questionIndex + 1) >= data.totalQuestions;

  document.getElementById('host-lb-subtitle').textContent = 
    `Standings after Question ${data.questionIndex + 1} of ${data.totalQuestions}`;


  const nextBtn = document.getElementById('btn-host-lb-next');
  if (nextBtn) {
    if (isLastQuestion) {
      nextBtn.innerHTML = '<span class="btn-advance-text">Grand Finale Podium 🏆</span>';
    } else {
      nextBtn.innerHTML = '<span class="btn-advance-text">Next Question ➔</span>';
    }
  }

  const listEl = document.getElementById('host-leaderboard-list');
  listEl.innerHTML = '';

  const topPlayers = data.topPlayers || [];
  const topScore = topPlayers.length > 0 ? Math.max(1, topPlayers[0].score) : 1;

  // Render Top 10 Students Standings
  topPlayers.forEach((p, idx) => {
    const row = document.createElement('div');
    const rankClass = p.rank <= 3 ? ` rank-${p.rank}` : '';
    row.className = `host-lb-row${rankClass} animated-swap`;
    row.style.animationDelay = `${idx * 0.08}s`;

    let placePill = '';
    if (p.rank === 1) {
      placePill = `<span class="host-place-pill place-1"><span class="crown-icon">👑</span> 1st Place</span>`;
    } else if (p.rank === 2) {
      placePill = `<span class="host-place-pill place-2">🥈 2nd Place</span>`;
    } else if (p.rank === 3) {
      placePill = `<span class="host-place-pill place-3">🥉 3rd Place</span>`;
    } else {
      placePill = `<span class="host-place-pill place-normal">#${p.rank} • ${p.rank}th Place</span>`;
    }

    // Calculate rank swap delta (▲ +2, ▼ -1, ★ NEW, —)
    const prev = hostRankHistory.get(p.nickname);
    let deltaBadge = '';
    const prevScore = prev ? prev.score : 0;

    if (prev) {
      const delta = prev.rank - p.rank;
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
    hostRankHistory.set(p.nickname, { rank: p.rank, score: p.score });

    const streakHtml = p.streak > 1 ? `<span class="lb-streak-pill">🔥 ${p.streak} streak</span>` : '';
    const barPct = Math.max(6, Math.min(100, Math.round((p.score / topScore) * 100)));

    row.innerHTML = `
      <div class="host-lb-bg-bar" style="width: ${barPct}%;"></div>
      <div class="host-lb-rank">
        ${placePill}
        ${deltaBadge}
      </div>
      <div class="host-lb-player">
        <span class="host-lb-avatar" style="display:inline-flex; align-items:center;">${getAvatarSvg(p.avatar, 28)}</span>
        <span class="host-lb-name">${p.nickname}</span>
        ${streakHtml}
      </div>
      <div class="host-lb-score" id="host-score-num-${idx}">${prevScore.toLocaleString()} pts</div>
    `;
    listEl.appendChild(row);

    // Dynamic number rolling animation
    setTimeout(() => {
      const scoreEl = document.getElementById(`host-score-num-${idx}`);
      if (scoreEl) {
        animateScoreRollup(scoreEl, prevScore, p.score, 850);
      }
    }, idx * 80);
  });

  // Update question jump select
  const select = document.getElementById('host-question-selector');
  if (select) select.value = data.questionIndex;
}

// ========================================================
// HOST QUESTION CONTROLS (Prev, Next, Pause, End Time, Jump)
// ========================================================
function hostPrevQuestion() {
  window.sounds.playSelect();
  sendHostEvent('host_prev_question', {
    pin: currentPin,
    hostToken: currentHostToken
  });
}

function hostNextQuestion() {
  window.sounds.playSelect();
  sendHostEvent('host_next_question', {
    pin: currentPin,
    hostToken: currentHostToken
  });
}

function hostEndQuestionNow() {
  window.sounds.playSelect();
  sendHostEvent('host_end_question_now', {
    pin: currentPin,
    hostToken: currentHostToken
  });
}

function toggleHostPause() {
  window.sounds.playSelect();
  if (isHostPaused) {
    sendHostEvent('host_resume_timer', {
      pin: currentPin,
      hostToken: currentHostToken
    });
  } else {
    stopAutoLeaderboardAdvance();
    sendHostEvent('host_pause_timer', {
      pin: currentPin,
      hostToken: currentHostToken
    });
  }
}

function updatePauseButtonUI(isPaused) {
  const icon = document.getElementById('ctrl-pause-icon');
  const text = document.getElementById('ctrl-pause-text');
  const btn = document.getElementById('ctrl-pause-btn');
  if (icon) icon.textContent = isPaused ? '▶️' : '⏸️';
  if (text) text.textContent = isPaused ? 'Resume' : 'Pause';
  if (btn) {
    if (isPaused) {
      btn.classList.add('is-paused-state');
      btn.title = 'Resume Timer (Keyboard: P)';
    } else {
      btn.classList.remove('is-paused-state');
      btn.title = 'Pause Timer (Keyboard: P)';
    }
  }
}

function onQuestionSelectChange(selectEl) {
  const val = selectEl.value;
  if (val === '' || val === null) return;
  hostJumpToQuestion(val);
}

function hostJumpToQuestion(index) {
  window.sounds.playSelect();
  sendHostEvent('host_jump_question', {
    pin: currentPin,
    hostToken: currentHostToken,
    questionIndex: parseInt(index, 10)
  });
}

function hostToggleLeaderboard() {
  hostNextAction();
}

function hostReviewQuestionResult() {
  if (lastQuestionResultCache) {
    stopAutoLeaderboardAdvance();
    showHostScreen('host-screen-result');
  }
}

function hostConfirmEndQuiz() {
  if (confirm('End the quiz now and celebrate the Top 10 Champions?')) {
    window.sounds.playSelect();
    sendHostEvent('host_end_game_early', {
      pin: currentPin,
      hostToken: currentHostToken
    });
  }
}

function animateScoreRollup(element, startVal, endVal, duration = 850) {
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

function hostProceedFromLeaderboard() {
  window.sounds.playSelect();
  sendHostEvent('host_next_question', {
    pin: currentPin,
    hostToken: currentHostToken
  });
}

function showPodium(data) {
  showHostScreen('host-screen-podium');
  window.sounds.playFanfare();
  window.confetti.burst(250);

  finalResultsCache = data.allResults || [];

  // 1st Place
  if (data.first) {
    document.getElementById('podium-1-avatar').innerHTML = getAvatarSvg(data.first.avatar, 64);
    document.getElementById('podium-1-name').textContent = data.first.nickname;
    document.getElementById('podium-1-score').textContent = `${data.first.score.toLocaleString()} pts (${data.first.accuracy}%)`;
  }
  // 2nd Place
  if (data.second) {
    document.getElementById('podium-2-avatar').innerHTML = getAvatarSvg(data.second.avatar, 64);
    document.getElementById('podium-2-name').textContent = data.second.nickname;
    document.getElementById('podium-2-score').textContent = `${data.second.score.toLocaleString()} pts (${data.second.accuracy}%)`;
  }
  // 3rd Place
  if (data.third) {
    document.getElementById('podium-3-avatar').innerHTML = getAvatarSvg(data.third.avatar, 64);
    document.getElementById('podium-3-name').textContent = data.third.nickname;
    document.getElementById('podium-3-score').textContent = `${data.third.score.toLocaleString()} pts (${data.third.accuracy}%)`;
  }

  // Top 10 Table
  const tableEl = document.getElementById('podium-top10-table');
  tableEl.innerHTML = '';

  data.top10.forEach((tp) => {
    const row = document.createElement('div');
    row.className = 'host-lb-row';
    row.style.padding = '0.75rem 1.25rem';
    row.style.marginBottom = '0.35rem';

    let rankLabel = `#${tp.rank}`;
    if (tp.rank === 1) rankLabel = '🥇 #1';
    else if (tp.rank === 2) rankLabel = '🥈 #2';
    else if (tp.rank === 3) rankLabel = '🥉 #3';

    row.innerHTML = `
      <div style="font-weight: 800; width: 60px; font-family: var(--font-main);">${rankLabel}</div>
      <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
        <span style="display:inline-flex; align-items:center;">${getAvatarSvg(tp.avatar, 28)}</span>
        <span style="font-weight: 700; font-size: 1.1rem;">${tp.nickname}</span>
        <span style="font-size: 0.85rem; color: #D97706; font-weight: 700;">(Best Streak: 🔥 ${tp.maxStreak})</span>
      </div>
      <div style="font-family: var(--font-code); font-weight: 800; font-size: 1.15rem; color: #4F46E5;">
        ${tp.score.toLocaleString()} pts (${tp.accuracy}%)
      </div>
    `;
    tableEl.appendChild(row);
  });
}

// Download Results as Excel-compatible CSV file
function downloadResultsCSV() {
  if (!finalResultsCache || finalResultsCache.length === 0) {
    alert('No completed quiz results available to download yet.');
    return;
  }

  let csvContent = 'Rank,Student Handle,Final Score,Accuracy,Correct Answers,Total Questions,Max Streak\n';
  finalResultsCache.forEach(r => {
    const safeName = `"${r.nickname.replace(/"/g, '""')}"`;
    csvContent += `${r.rank},${safeName},${r.score},"${r.accuracy}%",${r.correctCount},${r.totalQuestions},${r.maxStreak}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SE_Quiz_Results_PIN_${currentPin}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toggleSound() {
  const isMuted = window.sounds.toggleMute();
  const btn = document.getElementById('btn-sound-toggle');
  btn.textContent = isMuted ? '🔇' : '🔊';
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.log(err));
  } else {
    document.exitFullscreen().catch(err => console.log(err));
  }
}

let lastHostAdvanceTime = 0;

function advanceHostKahootFlow() {
  const now = Date.now();
  if (now - lastHostAdvanceTime < 300) return; // Debounce rapid key presses
  lastHostAdvanceTime = now;

  const activeScreen = document.querySelector('.host-view.active');
  if (!activeScreen) return;

  if (activeScreen.id === 'host-screen-lobby') {
    hostStartGame();
  } else if (activeScreen.id === 'host-screen-question') {
    // End question early / skip remaining timer
    hostEndQuestionNow();
  } else if (activeScreen.id === 'host-screen-result') {
    // Show Leaderboard with Top 10 standings animation
    hostNextAction();
  } else if (activeScreen.id === 'host-screen-leaderboard') {
    // Proceed to next question (or podium)
    hostProceedFromLeaderboard();
  } else if (activeScreen.id === 'host-screen-podium') {
    // Export results CSV
    downloadResultsCSV();
  }
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Skip if user is typing in a form input or selector
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
      return;
    }

    // Space or Enter: Single-key Kahoot advance
    if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      advanceHostKahootFlow();
      return;
    }

    // Optional quick keys for host
    if (e.key === 'p' || e.key === 'P') {
      toggleHostPause();
    } else if (e.key === 'e' || e.key === 'E') {
      hostEndQuestionNow();
    } else if (e.key === 'n' || e.key === 'N') {
      hostNextQuestion();
    } else if (e.key === 'b' || e.key === 'B') {
      hostPrevQuestion();
    } else if (e.key === 'l' || e.key === 'L') {
      hostToggleLeaderboard();
    }
  });
}

