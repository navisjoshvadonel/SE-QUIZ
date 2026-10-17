const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createWsTextFrame } = require('./miniWs');

class GameManager {
  constructor() {
    this.rooms = new Map();
    this.defaultQuestions = this.loadQuestions();
    this.validHostAuthTokens = new Set();
  }

  loadQuestions() {
    try {
      const qPath = path.join(__dirname, 'questions.json');
      const data = fs.readFileSync(qPath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to load questions.json, using fallback:', err);
      return [];
    }
  }

  generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  generateToken(prefix = 'tok_') {
    return prefix + crypto.randomBytes(12).toString('hex');
  }

  createRoom(customPin = null, hostClient = null) {
    let pin = (customPin || this.generatePin()).toString().trim().toUpperCase();
    if (this.rooms.has(pin)) {
      pin = this.generatePin();
    }

    const hostToken = this.generateToken('host_');

    const room = {
      pin,
      hostToken,
      hostClient,
      state: 'LOBBY', // 'LOBBY' | 'COUNTDOWN' | 'QUESTION' | 'RESULT' | 'LEADERBOARD' | 'GAME_OVER'
      questions: JSON.parse(JSON.stringify(this.defaultQuestions)),
      currentQuestionIndex: -1,
      questionStartTime: null,
      questionTimer: null,
      countdownTimer: null,
      timeLimit: 20,
      players: new Map(), // sessionToken -> Player object
      clientToToken: new Map(), // clientId -> sessionToken
      answers: new Map(), // sessionToken -> Answer record
      disconnectTimers: new Map(), // sessionToken -> Timeout
      lobbyStudentThrottleTimer: null,
      lastLobbyStudentBroadcastTime: 0,
      createdAt: Date.now()
    };

    this.rooms.set(pin, room);
    return room;
  }

  getRoom(pin) {
    if (!pin) return null;
    return this.rooms.get(pin.toString().trim().toUpperCase());
  }

  getRoomBySessionToken(sessionToken) {
    if (!sessionToken) return null;
    for (const room of this.rooms.values()) {
      if (room.players && room.players.has(sessionToken)) {
        return room;
      }
    }
    return null;
  }

  broadcastToRoom(room, event, data) {
    const text = JSON.stringify({ event, data });
    const frame = createWsTextFrame(text);
    // Send to host
    if (room.hostClient && !room.hostClient.socket.destroyed) {
      if (typeof room.hostClient.sendFrame === 'function') {
        room.hostClient.sendFrame(frame);
      } else {
        room.hostClient.send(text);
      }
    }
    // Send to all connected players with zero-copy pre-framed buffer
    for (const player of room.players.values()) {
      if (player.isConnected && player.client && !player.client.socket.destroyed) {
        if (typeof player.client.sendFrame === 'function') {
          player.client.sendFrame(frame);
        } else {
          player.client.send(text);
        }
      }
    }
  }

  broadcastToStudents(room, event, data) {
    if (!room || !room.players || room.players.size === 0) return;
    const text = JSON.stringify({ event, data });
    const frame = createWsTextFrame(text);
    for (const player of room.players.values()) {
      if (player.isConnected && player.client && !player.client.socket.destroyed) {
        if (typeof player.client.sendFrame === 'function') {
          player.client.sendFrame(frame);
        } else {
          player.client.send(text);
        }
      }
    }
  }

  sendToHost(room, event, data) {
    if (room && room.hostClient && !room.hostClient.socket.destroyed) {
      room.hostClient.send(JSON.stringify({ event, data }));
    }
  }

  sendToPlayer(player, event, data) {
    if (player && player.isConnected && player.client && !player.client.socket.destroyed) {
      player.client.send(JSON.stringify({ event, data }));
    }
  }

  isSensitiveTerm(text) {
    if (!text) return false;
    const lower = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const blocked = [
      'nigger', 'nigga', 'faggot', 'fag', 'bitch', 'whore', 'slut', 'cunt',
      'dick', 'pussy', 'cock', 'penis', 'vagina', 'hitler', 'nazi', 'retard',
      'porn', 'sex', 'asshole', 'bastard'
    ];
    return blocked.some(word => lower.includes(word));
  }

  // Add new player or rebind if nickname already exists in room
  addPlayer(pin, client, nickname, avatar) {
    const room = this.getRoom(pin);
    if (!room) {
      return { success: false, error: 'Room PIN not found. Please check and try again.' };
    }

    if (room.state === 'GAME_OVER') {
      return { success: false, error: 'This quiz session has already ended.' };
    }

    const cleanNick = (nickname || '').trim().slice(0, 20);
    if (!cleanNick) {
      return { success: false, error: 'Please enter a nickname.' };
    }

    if (this.isSensitiveTerm(cleanNick)) {
      return { success: false, error: 'Please choose a respectful, school-appropriate nickname.' };
    }

    // Ensure unique display nickname
    let finalNick = cleanNick;
    let counter = 1;
    const existingNicks = Array.from(room.players.values()).map(p => p.nickname.toLowerCase());
    while (existingNicks.includes(finalNick.toLowerCase())) {
      counter++;
      finalNick = `${cleanNick} (${counter})`;
    }

    const sessionToken = this.generateToken('stu_');

    const player = {
      sessionToken,
      clientId: client.id,
      client,
      nickname: finalNick,
      avatar: avatar || 'terminal-root',
      score: 0,
      streak: 0,
      maxStreak: 0,
      correctCount: 0,
      answersHistory: [],
      isConnected: true,
      disconnectedAt: null,
      joinedAt: Date.now()
    };

    room.players.set(sessionToken, player);
    room.clientToToken.set(client.id, sessionToken);

    // Notify lobby
    this.broadcastLobbyUpdate(room);

    return {
      success: true,
      sessionToken,
      player: {
        nickname: player.nickname,
        avatar: player.avatar,
        score: player.score
      },
      roomState: room.state,
      totalQuestions: room.questions.length,
      currentQuestionIndex: room.currentQuestionIndex
    };
  }

  // Resilient Reconnection for accidental F5 / page reloads
  reconnectPlayer(pin, sessionToken, newClient) {
    let room = this.getRoom(pin);
    if (!room && sessionToken) {
      room = this.getRoomBySessionToken(sessionToken);
    }
    if (!room) {
      return { success: false, error: 'Room does not exist or has closed.' };
    }

    const player = room.players.get(sessionToken);
    if (!player) {
      return { success: false, error: 'Session expired or player record not found.' };
    }

    // Cancel any pending disconnect cleanup timer
    if (room.disconnectTimers.has(sessionToken)) {
      clearTimeout(room.disconnectTimers.get(sessionToken));
      room.disconnectTimers.delete(sessionToken);
    }

    // Bind to the new active WebSocket connection
    player.isConnected = true;
    player.clientId = newClient.id;
    player.client = newClient;
    player.disconnectedAt = null;
    room.clientToToken.set(newClient.id, sessionToken);

    // Build context-aware state snapshot to restore the exact view
    const currentQ = room.currentQuestionIndex >= 0 ? room.questions[room.currentQuestionIndex] : null;
    const playerAnswer = room.answers.get(sessionToken);

    let activeQuestionSnapshot = null;
    if (room.state === 'QUESTION' && currentQ) {
      const elapsedMs = Math.max(0, Date.now() - (room.questionStartTime || Date.now()));
      activeQuestionSnapshot = {
        questionIndex: room.currentQuestionIndex,
        totalQuestions: room.questions.length,
        question: currentQ.question,
        options: currentQ.options,
        timeLimit: room.timeLimit,
        unit: currentQ.unit || '',
        difficulty: currentQ.difficulty || '',
        elapsedMs,
        alreadyAnswered: !!playerAnswer,
        chosenOption: playerAnswer ? playerAnswer.optionIndex : null
      };
    }

    let lastResultSnapshot = null;
    if ((room.state === 'RESULT' || room.state === 'LEADERBOARD') && currentQ) {
      lastResultSnapshot = {
        questionIndex: room.currentQuestionIndex,
        isCorrect: playerAnswer ? playerAnswer.isCorrect : false,
        scoreGained: playerAnswer ? playerAnswer.scoreGained : 0,
        streakBonus: playerAnswer ? playerAnswer.streakBonus : 0,
        streak: player.streak,
        currentScore: player.score,
        explanation: currentQ.explanation
      };
    }

    let leaderboardSnapshot = null;
    if (room.state === 'LEADERBOARD') {
      leaderboardSnapshot = this.getPlayerLeaderboardSnapshot(room, player);
    }

    // Inform the host of re-established connection
    this.broadcastLobbyUpdate(room);

    return {
      success: true,
      pin: room.pin,
      sessionToken,
      player: {
        nickname: player.nickname,
        avatar: player.avatar,
        score: player.score,
        streak: player.streak
      },
      roomState: room.state,
      currentQuestionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      activeQuestion: activeQuestionSnapshot,
      lastResult: lastResultSnapshot,
      leaderboard: leaderboardSnapshot
    };
  }

  // Host Reconnection (if teacher's browser refreshes)
  reconnectHost(pin, hostToken, newClient) {
    const room = this.getRoom(pin);
    if (!room || room.hostToken !== hostToken) {
      return { success: false, error: 'Invalid host credentials or room not found.' };
    }

    room.hostClient = newClient;

    const currentQ = room.currentQuestionIndex >= 0 ? room.questions[room.currentQuestionIndex] : null;

    return {
      success: true,
      pin: room.pin,
      hostToken: room.hostToken,
      state: room.state,
      currentQuestionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      totalPlayers: room.players.size,
      currentQuestion: currentQ ? {
        question: currentQ.question,
        options: currentQ.options,
        timeLimit: room.timeLimit,
        unit: currentQ.unit || '',
        difficulty: currentQ.difficulty || '',
        elapsedMs: Date.now() - (room.questionStartTime || Date.now())
      } : null
    };
  }

  // Graceful disconnect handling: retain student state for up to 2 minutes
  handleDisconnect(clientId) {
    for (const room of this.rooms.values()) {
      // Check if it's the host
      if (room.hostClient && room.hostClient.id === clientId) {
        room.hostClient = null;
        console.log(`Host disconnected from room ${room.pin}. Room preserved for reconnect.`);
        return;
      }

      // Check if it's a student
      const sessionToken = room.clientToToken.get(clientId);
      if (sessionToken && room.players.has(sessionToken)) {
        const player = room.players.get(sessionToken);
        player.isConnected = false;
        player.client = null;
        player.disconnectedAt = Date.now();
        room.clientToToken.delete(clientId);

        console.log(`Student "${player.nickname}" disconnected (F5 / tab drop). Preserving state.`);

        // Set a 120-second grace window before permanent cleanup
        const timer = setTimeout(() => {
          if (!player.isConnected) {
            console.log(`Student "${player.nickname}" did not reconnect within 2m. Removing.`);
            room.players.delete(sessionToken);
            room.answers.delete(sessionToken);
            room.disconnectTimers.delete(sessionToken);
            this.broadcastLobbyUpdate(room);

            if (room.state === 'QUESTION') {
              this.checkAllAnswered(room);
            }
          }
        }, 120000);

        room.disconnectTimers.set(sessionToken, timer);

        // If in question phase, check if remaining players have answered
        if (room.state === 'QUESTION') {
          this.checkAllAnswered(room);
        }

        return;
      }
    }
  }

  broadcastLobbyUpdate(room) {
    if (!room) return;

    // 1. Direct targeted dispatch to Host with full student list and kick capabilities
    const playerList = Array.from(room.players.values()).map(p => ({
      sessionToken: p.sessionToken,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      isConnected: p.isConnected
    }));

    this.sendToHost(room, 'lobby_update', {
      playerCount: playerList.length,
      players: playerList,
      pin: room.pin,
      totalQuestions: room.questions.length
    });

    // 2. Throttled, security-sanitized broadcast to students (playerCount only, no session tokens)
    if (room.state !== 'LOBBY') return;

    const LOBBY_THROTTLE_MS = 300;
    const now = Date.now();
    const timeSinceLast = now - (room.lastLobbyStudentBroadcastTime || 0);

    const dispatchStudents = () => {
      room.lobbyStudentThrottleTimer = null;
      room.lastLobbyStudentBroadcastTime = Date.now();
      if (room.state !== 'LOBBY') return;
      this.broadcastToStudents(room, 'lobby_update', {
        playerCount: room.players.size,
        pin: room.pin
      });
    };

    if (timeSinceLast >= LOBBY_THROTTLE_MS) {
      if (room.lobbyStudentThrottleTimer) {
        clearTimeout(room.lobbyStudentThrottleTimer);
        room.lobbyStudentThrottleTimer = null;
      }
      dispatchStudents();
    } else if (!room.lobbyStudentThrottleTimer) {
      room.lobbyStudentThrottleTimer = setTimeout(dispatchStudents, LOBBY_THROTTLE_MS - timeSinceLast);
    }
  }

  startGame(pin, hostToken) {
    const room = this.getRoom(pin);
    if (!room || room.hostToken !== hostToken) {
      return { success: false, error: 'Unauthorized or room not found.' };
    }

    if (room.lobbyStudentThrottleTimer) {
      clearTimeout(room.lobbyStudentThrottleTimer);
      room.lobbyStudentThrottleTimer = null;
    }

    room.currentQuestionIndex = -1;
    this.nextQuestion(room);
    return { success: true };
  }

  nextQuestion(room) {
    if (room.questionTimer) clearTimeout(room.questionTimer);
    if (room.countdownTimer) clearTimeout(room.countdownTimer);

    room.currentQuestionIndex++;
    if (room.currentQuestionIndex >= room.questions.length) {
      this.endGame(room);
      return;
    }

    room.state = 'COUNTDOWN';
    room.answers.clear();

    const currentQ = room.questions[room.currentQuestionIndex];
    let countdown = 5;

    this.broadcastToRoom(room, 'countdown_start', {
      countdown,
      questionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      questionPreview: {
        text: currentQ.question,
        category: currentQ.unit || 'Software Engineering'
      }
    });

    const interval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        this.broadcastToRoom(room, 'countdown_tick', { countdown });
      } else {
        clearInterval(interval);
        this.startQuestion(room);
      }
    }, 1000);

    room.countdownTimer = interval;
  }

  startQuestion(room) {
    const q = room.questions[room.currentQuestionIndex];
    room.state = 'QUESTION';
    room.timeLimit = q.timeLimit || 20;
    room.questionStartTime = Date.now();
    room.remainingMs = room.timeLimit * 1000;
    room.isPaused = false;
    room.isResolvingAllAnswered = false;
    room.answers.clear();

    const payload = {
      questionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      question: q.question,
      options: q.options,
      timeLimit: room.timeLimit,
      points: q.points || 1000,
      unit: q.unit || '',
      difficulty: q.difficulty || ''
    };

    this.broadcastToRoom(room, 'question_start', payload);

    room.questionTimer = setTimeout(() => {
      this.resolveQuestion(room);
    }, (room.timeLimit + 0.5) * 1000);
  }

  // Host Controls: Pause Timer
  pauseQuestion(pin, hostToken) {
    const room = this.getRoom(pin);
    if (!room || room.hostToken !== hostToken) return { success: false, error: 'Unauthorized' };
    if (room.state !== 'QUESTION' || room.isPaused) return { success: false, error: 'Not in active question' };

    const elapsed = Date.now() - (room.questionStartTime || Date.now());
    room.remainingMs = Math.max(500, (room.timeLimit * 1000) - elapsed);
    room.isPaused = true;
    if (room.questionTimer) clearTimeout(room.questionTimer);

    this.broadcastToRoom(room, 'timer_paused', {
      remainingMs: room.remainingMs,
      remainingSec: Math.ceil(room.remainingMs / 1000)
    });

    return { success: true, isPaused: true, remainingMs: room.remainingMs };
  }

  // Host Controls: Resume Timer
  resumeQuestion(pin, hostToken) {
    const room = this.getRoom(pin);
    if (!room || room.hostToken !== hostToken) return { success: false, error: 'Unauthorized' };
    if (room.state !== 'QUESTION' || !room.isPaused) return { success: false, error: 'Not paused' };

    room.isPaused = false;
    room.questionStartTime = Date.now() - ((room.timeLimit * 1000) - room.remainingMs);

    this.broadcastToRoom(room, 'timer_resumed', {
      remainingMs: room.remainingMs,
      remainingSec: Math.ceil(room.remainingMs / 1000)
    });

    room.questionTimer = setTimeout(() => {
      this.resolveQuestion(room);
    }, room.remainingMs + 200);

    return { success: true, isPaused: false, remainingMs: room.remainingMs };
  }

  // Host Controls: Force End Question / Skip Timer
  forceEndQuestion(pin, hostToken) {
    const room = this.getRoom(pin);
    if (!room || room.hostToken !== hostToken) return { success: false, error: 'Unauthorized' };
    if (room.state !== 'QUESTION') return { success: false, error: 'Not in question state' };

    if (room.questionTimer) clearTimeout(room.questionTimer);
    if (room.allAnsweredTimeout) clearTimeout(room.allAnsweredTimeout);
    this.resolveQuestion(room);
    return { success: true };
  }

  // Host Controls: Jump directly to any question (0-indexed)
  jumpToQuestion(pin, hostToken, targetIndex) {
    const room = this.getRoom(pin);
    if (!room || room.hostToken !== hostToken) return { success: false, error: 'Unauthorized' };

    const idx = parseInt(targetIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= room.questions.length) {
      return { success: false, error: 'Invalid question index' };
    }

    if (room.questionTimer) clearTimeout(room.questionTimer);
    if (room.countdownTimer) clearInterval(room.countdownTimer);

    room.currentQuestionIndex = idx - 1;
    this.nextQuestion(room);
    return { success: true, targetIndex: idx };
  }

  // Host Controls: Previous Question
  prevQuestion(pin, hostToken) {
    const room = this.getRoom(pin);
    if (!room || room.hostToken !== hostToken) return { success: false, error: 'Unauthorized' };

    if (room.questionTimer) clearTimeout(room.questionTimer);
    if (room.countdownTimer) clearInterval(room.countdownTimer);

    const prevIdx = Math.max(0, room.currentQuestionIndex - 1);
    room.currentQuestionIndex = prevIdx - 1;
    this.nextQuestion(room);
    return { success: true, targetIndex: prevIdx };
  }

  submitAnswer(room, sessionToken, optionIndex) {
    if (room.state !== 'QUESTION') return null;
    if (room.answers.has(sessionToken)) {
      // Already recorded this round - return existing record (prevents double scoring)
      return room.answers.get(sessionToken);
    }

    const player = room.players.get(sessionToken);
    if (!player) return null;

    const optIdx = parseInt(optionIndex, 10);
    const q = room.questions[room.currentQuestionIndex];
    if (!q) return null;

    const correctIdx = parseInt(q.correctIndex, 10);
    const isCorrect = Number.isInteger(optIdx) && optIdx === correctIdx;

    const now = Date.now();
    const timeLimit = room.timeLimit || 20;
    const startTime = room.questionStartTime || (now - 1000);
    const timeTaken = Math.max(0.05, Math.min(timeLimit, (now - startTime) / 1000));

    let scoreGained = 0;
    let streakBonus = 0;

    if (isCorrect) {
      // Authentic Kahoot Scoring Formula:
      // Points = round((1 - ((timeTaken / timeLimit) / 2)) * 1000)
      // Instant click (0s): 1000 points
      // Mid click (10s / 20s): 750 points
      // Buzzer click (20s / 20s): 500 points
      // Wrong answer: 0 points
      const timeRatio = Math.min(1, Math.max(0, timeTaken / timeLimit));
      const basePoints = Math.round((1 - (timeRatio / 2)) * 1000);

      player.streak++;
      if (player.streak > player.maxStreak) {
        player.maxStreak = player.streak;
      }
      player.correctCount++;

      // Kahoot Streak Bonus for consecutive correct answers:
      if (player.streak >= 5) streakBonus = 500;
      else if (player.streak === 4) streakBonus = 300;
      else if (player.streak === 3) streakBonus = 200;
      else if (player.streak === 2) streakBonus = 100;
      else streakBonus = 0;

      scoreGained = basePoints + streakBonus;
      player.score += scoreGained;
    } else {
      player.streak = 0;
      scoreGained = 0;
      streakBonus = 0;
    }

    const answerRecord = {
      optionIndex: optIdx,
      timeTaken: Number(timeTaken.toFixed(2)),
      scoreGained,
      streakBonus,
      isCorrect,
      streak: player.streak
    };

    room.answers.set(sessionToken, answerRecord);
    player.answersHistory.push(answerRecord);

    console.log(`[Quiz Score] Player "${player.nickname}" answered option ${optIdx} (correct=${correctIdx}) in ${timeTaken.toFixed(2)}s -> ${isCorrect ? `CORRECT (+${scoreGained} pts, total=${player.score})` : 'WRONG (+0 pts)'}`);

    // Instant feedback to player (acknowledges receipt without revealing right/wrong)
    this.sendToPlayer(player, 'answer_received', {
      received: true,
      timeTaken: answerRecord.timeTaken,
      optionIndex: optIdx
    });

    const activePlayerCount = Array.from(room.players.values()).filter(p => p.isConnected).length;

    // Host always receives instant progress updates for live presenter counters
    this.sendToHost(room, 'answer_progress', {
      answeredCount: room.answers.size,
      totalPlayers: activePlayerCount,
      lastAnsweredNickname: player.nickname,
      lastAnsweredAvatar: player.avatar
    });

    // Throttled student broadcast: update students smoothly without packet floods during 80+ rushes
    if (room.answers.size === 1 || room.answers.size >= activePlayerCount || !room.studentProgressTimer) {
      if (room.studentProgressTimer) clearTimeout(room.studentProgressTimer);
      room.studentProgressTimer = null;
      const progressPayload = JSON.stringify({
        event: 'answer_progress',
        data: {
          answeredCount: room.answers.size,
          totalPlayers: activePlayerCount,
          lastAnsweredNickname: player.nickname,
          lastAnsweredAvatar: player.avatar
        }
      });
      const progressFrame = createWsTextFrame(progressPayload);
      for (const p of room.players.values()) {
        if (p.isConnected && p.client && !p.client.socket.destroyed) {
          if (typeof p.client.sendFrame === 'function') p.client.sendFrame(progressFrame);
          else p.client.send(progressPayload);
        }
      }
    } else if (!room.pendingStudentProgress) {
      room.pendingStudentProgress = true;
      room.studentProgressTimer = setTimeout(() => {
        room.pendingStudentProgress = false;
        room.studentProgressTimer = null;
        const curActive = Array.from(room.players.values()).filter(p => p.isConnected).length;
        const delayedPayload = JSON.stringify({
          event: 'answer_progress',
          data: {
            answeredCount: room.answers.size,
            totalPlayers: curActive
          }
        });
        const delayedFrame = createWsTextFrame(delayedPayload);
        for (const p of room.players.values()) {
          if (p.isConnected && p.client && !p.client.socket.destroyed) {
            if (typeof p.client.sendFrame === 'function') p.client.sendFrame(delayedFrame);
            else p.client.send(delayedPayload);
          }
        }
      }, 120);
    }

    this.checkAllAnswered(room);
    return answerRecord;
  }

  checkAllAnswered(room) {
    if (room.state !== 'QUESTION' || room.isResolvingAllAnswered) return;
    const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
    const activeCount = connectedPlayers.length;
    if (activeCount > 0 && room.answers.size >= activeCount) {
      room.isResolvingAllAnswered = true;
      if (room.questionTimer) clearTimeout(room.questionTimer);
      // Give 1.5-second suspense countdown so answer isn't abruptly flashed
      this.broadcastToRoom(room, 'all_answered_countdown', {
        delayMs: 1500,
        message: 'All answers locked in! 🔒 Revealing results...'
      });
      if (room.allAnsweredTimeout) clearTimeout(room.allAnsweredTimeout);
      room.allAnsweredTimeout = setTimeout(() => {
        this.resolveQuestion(room);
      }, 1500);
    }
  }

  resolveQuestion(room) {
    if (room.state !== 'QUESTION') return;
    room.state = 'RESULT';
    room.isResolvingAllAnswered = false;
    if (room.questionTimer) clearTimeout(room.questionTimer);
    if (room.allAnsweredTimeout) clearTimeout(room.allAnsweredTimeout);

    const q = room.questions[room.currentQuestionIndex];
    const sorted = this.getSortedLeaderboard(room);

    // O(1) rank lookup Map for 60+ players
    const tokenToRank = new Map();
    sorted.forEach((p, idx) => tokenToRank.set(p.sessionToken, idx + 1));

    const distribution = [0, 0, 0, 0];
    for (const ans of room.answers.values()) {
      if (ans.optionIndex >= 0 && ans.optionIndex < 4) {
        distribution[ans.optionIndex]++;
      }
    }

    const top10Summary = sorted.slice(0, 10).map((p, idx) => {
      const ans = room.answers.get(p.sessionToken);
      return {
        rank: idx + 1,
        sessionToken: p.sessionToken,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        streak: p.streak,
        scoreGained: ans ? ans.scoreGained : 0,
        isCorrect: ans ? ans.isCorrect : false,
        timeTaken: ans ? ans.timeTaken : null
      };
    });

    // Host result with full question text, options, correct answer, explanation, and top 10 standings
    this.sendToHost(room, 'question_result_host', {
      questionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      correctText: q.options[q.correctIndex],
      explanation: q.explanation,
      unit: q.unit || '',
      difficulty: q.difficulty || '',
      distribution,
      totalAnswered: room.answers.size,
      totalPlayers: room.players.size,
      topPlayers: top10Summary
    });

    // Personalized player results in O(N) linear time for 60+ players
    for (const [sessionToken, player] of room.players.entries()) {
      const answer = room.answers.get(sessionToken) || {
        optionIndex: -1,
        isCorrect: false,
        scoreGained: 0,
        streakBonus: 0,
        streak: 0
      };

      const rank = tokenToRank.get(sessionToken) || room.players.size;

      this.sendToPlayer(player, 'question_result_player', {
        questionIndex: room.currentQuestionIndex,
        isCorrect: answer.isCorrect,
        chosenOption: answer.optionIndex,
        scoreGained: answer.scoreGained,
        streakBonus: answer.streakBonus,
        streak: player.streak,
        currentScore: player.score,
        rank,
        correctIndex: q.correctIndex,
        correctText: q.options[q.correctIndex],
        explanation: q.explanation
      });
    }
  }

  getPlayerLeaderboardSnapshot(room, player) {
    const topPlayers = this.getSortedLeaderboard(room);
    const top10 = topPlayers.slice(0, 10).map((tp, idx) => ({
      rank: idx + 1,
      nickname: tp.nickname,
      avatar: tp.avatar,
      score: tp.score,
      streak: tp.streak
    }));
    const myIndex = topPlayers.findIndex(p => p.sessionToken === player.sessionToken);
    const rank = myIndex >= 0 ? myIndex + 1 : topPlayers.length;
    const aheadPlayer = myIndex > 0 ? topPlayers[myIndex - 1] : null;
    const pointsBehind = aheadPlayer ? aheadPlayer.score - player.score : 0;

    return {
      rank,
      score: player.score,
      top10,
      pointsBehind,
      aheadPlayerName: aheadPlayer ? aheadPlayer.nickname : null,
      streak: player.streak
    };
  }

  showLeaderboard(room) {
    room.state = 'LEADERBOARD';
    const topPlayers = this.getSortedLeaderboard(room);
    const currentQ = room.currentQuestionIndex >= 0 ? room.questions[room.currentQuestionIndex] : null;

    // Pre-calculate top 5 and top 10 slices ONCE for 60+ players
    const top5 = topPlayers.slice(0, 5).map((tp, idx) => ({
      rank: idx + 1,
      nickname: tp.nickname,
      avatar: tp.avatar,
      score: tp.score,
      streak: tp.streak
    }));

    const top10 = topPlayers.slice(0, 10).map((tp, idx) => ({
      rank: idx + 1,
      nickname: tp.nickname,
      avatar: tp.avatar,
      score: tp.score,
      streak: tp.streak
    }));

    this.sendToHost(room, 'leaderboard_update_host', {
      questionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      question: currentQ ? currentQ.question : '',
      options: currentQ ? currentQ.options : [],
      correctIndex: currentQ ? currentQ.correctIndex : -1,
      correctText: currentQ ? currentQ.options[currentQ.correctIndex] : '',
      unit: currentQ ? (currentQ.unit || '') : '',
      topPlayers: top10,
      totalPlayers: room.players.size
    });

    // Dispatch player snapshots in pure O(N) with zero redundant sorting
    for (let i = 0; i < topPlayers.length; i++) {
      const p = topPlayers[i];
      const rank = i + 1;
      const aheadPlayer = i > 0 ? topPlayers[i - 1] : null;
      const pointsBehind = aheadPlayer ? aheadPlayer.score - p.score : 0;

      this.sendToPlayer(p, 'leaderboard_update_player', {
        rank,
        score: p.score,
        top5,
        top10,
        pointsBehind,
        aheadPlayerName: aheadPlayer ? aheadPlayer.nickname : null,
        streak: p.streak
      });
    }
  }

  endGame(room) {
    room.state = 'GAME_OVER';
    room.isResolvingAllAnswered = false;
    if (room.questionTimer) clearTimeout(room.questionTimer);
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.allAnsweredTimeout) clearTimeout(room.allAnsweredTimeout);
    if (room.studentProgressTimer) clearTimeout(room.studentProgressTimer);
    if (room.lobbyStudentThrottleTimer) clearTimeout(room.lobbyStudentThrottleTimer);
    if (room.disconnectTimers) {
      for (const t of room.disconnectTimers.values()) {
        clearTimeout(t);
      }
      room.disconnectTimers.clear();
    }

    const sorted = this.getSortedLeaderboard(room);

    const podium = {
      first: sorted[0] ? {
        nickname: sorted[0].nickname,
        avatar: sorted[0].avatar,
        score: sorted[0].score,
        accuracy: Math.round((sorted[0].correctCount / room.questions.length) * 100)
      } : null,
      second: sorted[1] ? {
        nickname: sorted[1].nickname,
        avatar: sorted[1].avatar,
        score: sorted[1].score,
        accuracy: Math.round((sorted[1].correctCount / room.questions.length) * 100)
      } : null,
      third: sorted[2] ? {
        nickname: sorted[2].nickname,
        avatar: sorted[2].avatar,
        score: sorted[2].score,
        accuracy: Math.round((sorted[2].correctCount / room.questions.length) * 100)
      } : null,
      top10: sorted.slice(0, 10).map((p, idx) => ({
        rank: idx + 1,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        correctCount: p.correctCount,
        accuracy: Math.round((p.correctCount / room.questions.length) * 100),
        maxStreak: p.maxStreak
      })),
      allResults: sorted.map((p, idx) => ({
        rank: idx + 1,
        nickname: p.nickname,
        score: p.score,
        correctCount: p.correctCount,
        totalQuestions: room.questions.length,
        accuracy: Math.round((p.correctCount / room.questions.length) * 100),
        maxStreak: p.maxStreak
      })),
      totalPlayers: sorted.length,
      totalQuestions: room.questions.length
    };

    console.log('\n========================================');
    console.log(`🏆 QUIZ ARENA COMPLETE - ROOM ${room.pin}`);
    console.log('🎉 OFFICIAL PODIUM - TOP 3 CHAMPIONS:');
    if (podium.first) console.log(`🥇 1st Place: ${podium.first.nickname} - ${podium.first.score.toLocaleString()} pts (${podium.first.accuracy}%)`);
    if (podium.second) console.log(`🥈 2nd Place: ${podium.second.nickname} - ${podium.second.score.toLocaleString()} pts (${podium.second.accuracy}%)`);
    if (podium.third) console.log(`🥉 3rd Place: ${podium.third.nickname} - ${podium.third.score.toLocaleString()} pts (${podium.third.accuracy}%)`);
    console.log(`Total Participants: ${sorted.length}`);
    console.log('========================================\n');

    this.broadcastToRoom(room, 'game_over', podium);
  }

  getSortedLeaderboard(room) {
    return Array.from(room.players.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.joinedAt - b.joinedAt;
    });
  }
}

module.exports = GameManager;
