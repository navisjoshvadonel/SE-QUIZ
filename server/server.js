// server/server.js
// High-performance Zero-Dependency Quiz Server with Resilient Session Reconnection
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { WebSocketServer } = require('./miniWs');
const GameManager = require('./gameManager');
const { generateQRCodeSVG } = require('./qr');

const PORT = process.env.PORT || 3000;
const HOST_PASSWORD = process.env.HOST_PASSWORD || 'njnjnj';
const gameManager = new GameManager();

// Mime Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function getNetworkIps() {
  const ifaces = os.networkInterfaces();
  const list = [];
  const VIRTUAL_REGEX = /(virtual|vmware|vbox|veth|wsl|hyper-v|docker|pseudo|loopback|tap|tun|tailscale|zerotier|hamachi)/i;

  for (const [name, arr] of Object.entries(ifaces)) {
    for (const iface of arr) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const isVirtual = VIRTUAL_REGEX.test(name) || iface.address.startsWith('169.254.') || iface.address.startsWith('192.168.56.');
        list.push({
          name,
          address: iface.address,
          isVirtual,
          isWifi: /wi-?fi|wireless|wlan/i.test(name)
        });
      }
    }
  }

  // Sort: non-virtual Wi-Fi first, then non-virtual Ethernet, then virtual
  list.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    if (a.isWifi !== b.isWifi) return a.isWifi ? -1 : 1;
    return 0;
  });

  return list;
}

function getLocalIp() {
  const ips = getNetworkIps();
  if (ips.length > 0 && !ips[0].isVirtual) {
    return ips[0].address;
  }
  if (ips.length > 0) {
    return ips[0].address;
  }
  return 'localhost';
}

// In-Memory Static Asset Cache (Pre-loads all static files into RAM for 60+ concurrent students)
const staticCache = new Map();
const PUBLIC_DIR = path.resolve(__dirname, '../public');

function loadStaticCache() {
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile()) {
        const relPath = path.relative(PUBLIC_DIR, fullPath).replace(/\\/g, '/');
        const urlPath = '/' + relPath;
        const buffer = fs.readFileSync(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const etag = `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;

        let gzipBuffer = null;
        if (['.html', '.css', '.js', '.json', '.svg'].includes(ext)) {
          try {
            gzipBuffer = zlib.gzipSync(buffer);
          } catch (e) {}
        }

        const entryData = {
          buffer,
          gzipBuffer,
          contentType,
          etag,
          ext
        };

        staticCache.set(urlPath, entryData);

        // Aliases for default root and host
        if (urlPath === '/index.html') {
          staticCache.set('/', entryData);
        } else if (urlPath === '/host.html') {
          staticCache.set('/host', entryData);
        }
      }
    }
  }

  scanDir(PUBLIC_DIR);
}

// Pre-load all assets into memory at startup
loadStaticCache();

// HTTP Server
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // REST API Routes
  if (pathname === '/api/info') {
    const hostHeader = req.headers.host || `localhost:${PORT}`;
    const cleanDomain = hostHeader.replace(/^https?:\/\//i, '');
    const localIp = getLocalIp();
    const isLoopbackHost = cleanDomain.startsWith('localhost') || cleanDomain.startsWith('127.0.0.1');
    const recommendedDomain = isLoopbackHost && localIp !== 'localhost' ? `${localIp}:${PORT}` : cleanDomain;

    let latestRoom = gameManager.getLatestRoom();
    if (!latestRoom || latestRoom.state === 'GAME_OVER') {
      latestRoom = gameManager.createRoom();
      console.log(`🔑 [Auto Room Init] Ready with Game PIN: [ ${latestRoom.pin} ]`);
    }
    const activePin = latestRoom ? latestRoom.pin : null;
    const allIps = getNetworkIps();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({
      appName: 'SE Quiz Game Arena',
      version: '1.0.0',
      joinDomain: recommendedDomain,
      lanIp: localIp,
      allIps: allIps.map(i => ({ name: i.name, ip: i.address, isWifi: i.isWifi })),
      port: PORT,
      activeRooms: gameManager.rooms.size,
      activePin: activePin,
      pin: activePin,
      code: activePin,
      state: latestRoom ? latestRoom.state : 'LOBBY',
      playerCount: latestRoom ? latestRoom.players.size : 0,
      totalQuestions: latestRoom ? latestRoom.questions.length : 50
    }));
    return;
  }

  // QR Code SVG Generator Endpoint
  if (pathname === '/api/qr') {
    const requestedUrl = parsedUrl.searchParams.get('url');
    const pin = parsedUrl.searchParams.get('pin');
    let target = requestedUrl;
    if (!target) {
      const bestIp = getLocalIp();
      const base = `http://${bestIp}:${PORT}`;
      target = pin ? `${base}/?pin=${encodeURIComponent(pin)}` : base;
    }
    const svg = generateQRCodeSVG(target);
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(svg);
    return;
  }

  if (pathname === '/api/questions') {
    const safeQuestions = gameManager.defaultQuestions.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options,
      timeLimit: q.timeLimit,
      points: q.points
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      total: safeQuestions.length,
      questions: safeQuestions
    }));
    return;
  }

  const MAX_POST_BYTES = 65536; // 64 KB safety cap

  if (pathname === '/api/host/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_POST_BYTES) req.destroy();
    });
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body || '{}');
        if (password && password.trim() === HOST_PASSWORD) {
          const hostAuthToken = crypto.randomBytes(16).toString('hex');
          gameManager.validHostAuthTokens.add(hostAuthToken);

          let room = gameManager.getLatestRoom();
          if (!room || room.state === 'GAME_OVER') {
            room = gameManager.createRoom();
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            hostAuthToken,
            pin: room.pin,
            hostToken: room.hostToken,
            state: room.state,
            totalQuestions: room.questions.length,
            playerCount: room.players.size
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Incorrect host password.' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid request body.' }));
      }
    });
    return;
  }

  // Create or Regenerate Room via REST (100% immune to lab firewall WS blocks)
  if (pathname === '/api/host/create_room' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_POST_BYTES) req.destroy();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const isPwValid = (data.password && data.password.trim() === HOST_PASSWORD) ||
                          (data.hostAuthToken && gameManager.validHostAuthTokens.has(data.hostAuthToken));
        if (!isPwValid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Incorrect host password. Access denied.' }));
          return;
        }
        const room = gameManager.createRoom(data.customPin);
        console.log(`🔑 [REST API] Host created fresh Room PIN: [ ${room.pin} ]`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          pin: room.pin,
          hostToken: room.hostToken,
          state: room.state,
          totalQuestions: room.questions.length,
          playerCount: 0
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid request body.' }));
      }
    });
    return;
  }

  // Student Join via REST (Instant fallback for lab firewalls blocking WebSocket)
  if (pathname === '/api/player/join' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_POST_BYTES) req.destroy();
    });
    req.on('end', () => {
      try {
        const { pin, nickname, avatar } = JSON.parse(body || '{}');
        const mockClient = {
          id: 'rest_' + Math.random().toString(36).slice(2, 9),
          send: () => {},
          sendFrame: () => {},
          socket: { destroyed: false, writable: false }
        };
        const result = gameManager.addPlayer(pin, mockClient, nickname, avatar);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Room Polling State API (Synchronizes game state across lab PCs if WebSockets are blocked)
  if (pathname === '/api/room/state') {
    const pin = parsedUrl.searchParams.get('pin');
    const sessionToken = parsedUrl.searchParams.get('sessionToken');
    const hostToken = parsedUrl.searchParams.get('hostToken');
    const room = gameManager.getRoom(pin);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Room not found' }));
      return;
    }

    const isHost = hostToken && room.hostToken === hostToken;
    const player = sessionToken ? room.players.get(sessionToken) : null;
    const currentQ = room.currentQuestionIndex >= 0 ? room.questions[room.currentQuestionIndex] : null;
    const elapsedMs = room.questionStartTime ? Math.max(0, Date.now() - room.questionStartTime) : 0;
    const remainingMs = Math.max(0, (room.timeLimit * 1000) - elapsedMs);
    const activePlayerCount = Array.from(room.players.values()).filter(p => p.isConnected).length;

    const playersList = isHost ? Array.from(room.players.values()).map(p => ({
      sessionToken: p.sessionToken,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      isConnected: p.isConnected
    })) : null;

    // Build state-specific snapshots
    let resultSnapshot = null;
    let leaderboardSnapshot = null;
    let gameOverSnapshot = null;

    if (room.state === 'RESULT' && currentQ) {
      const sorted = gameManager.getSortedLeaderboard(room);
      const tokenToRank = new Map();
      sorted.forEach((p, idx) => tokenToRank.set(p.sessionToken, idx + 1));
      const distribution = [0, 0, 0, 0];
      for (const ans of room.answers.values()) {
        if (ans.optionIndex >= 0 && ans.optionIndex < 4) distribution[ans.optionIndex]++;
      }
      const top10Summary = sorted.slice(0, 10).map((p, idx) => {
        const ans = room.answers.get(p.sessionToken);
        return {
          rank: idx + 1,
          nickname: p.nickname,
          avatar: p.avatar,
          score: p.score,
          streak: p.streak,
          scoreGained: ans ? ans.scoreGained : 0,
          isCorrect: ans ? ans.isCorrect : false,
          timeTaken: ans ? ans.timeTaken : null
        };
      });

      const playerAns = sessionToken ? room.answers.get(sessionToken) : null;
      resultSnapshot = {
        questionIndex: room.currentQuestionIndex,
        totalQuestions: room.questions.length,
        question: currentQ.question,
        options: currentQ.options,
        correctIndex: currentQ.correctIndex,
        correctText: currentQ.options[currentQ.correctIndex],
        explanation: currentQ.explanation,
        unit: currentQ.unit || '',
        difficulty: currentQ.difficulty || '',
        distribution,
        totalAnswered: room.answers.size,
        totalPlayers: room.players.size,
        topPlayers: top10Summary,
        playerResult: player ? {
          questionIndex: room.currentQuestionIndex,
          isCorrect: playerAns ? playerAns.isCorrect : false,
          chosenOption: playerAns ? playerAns.optionIndex : -1,
          scoreGained: playerAns ? playerAns.scoreGained : 0,
          streakBonus: playerAns ? playerAns.streakBonus : 0,
          streak: player.streak,
          currentScore: player.score,
          rank: tokenToRank.get(sessionToken) || room.players.size,
          correctIndex: currentQ.correctIndex,
          correctText: currentQ.options[currentQ.correctIndex],
          explanation: currentQ.explanation
        } : null
      };
    } else if (room.state === 'LEADERBOARD') {
      const sorted = gameManager.getSortedLeaderboard(room);
      const top10 = sorted.slice(0, 10).map((tp, idx) => ({
        rank: idx + 1,
        nickname: tp.nickname,
        avatar: tp.avatar,
        score: tp.score,
        streak: tp.streak
      }));
      leaderboardSnapshot = {
        questionIndex: room.currentQuestionIndex,
        totalQuestions: room.questions.length,
        topPlayers: top10,
        totalPlayers: room.players.size,
        playerLeaderboard: player ? gameManager.getPlayerLeaderboardSnapshot(room, player) : null
      };
    } else if (room.state === 'GAME_OVER') {
      const sorted = gameManager.getSortedLeaderboard(room);
      gameOverSnapshot = {
        first: sorted[0] ? { nickname: sorted[0].nickname, avatar: sorted[0].avatar, score: sorted[0].score, accuracy: Math.round((sorted[0].correctCount / room.questions.length) * 100) } : null,
        second: sorted[1] ? { nickname: sorted[1].nickname, avatar: sorted[1].avatar, score: sorted[1].score, accuracy: Math.round((sorted[1].correctCount / room.questions.length) * 100) } : null,
        third: sorted[2] ? { nickname: sorted[2].nickname, avatar: sorted[2].avatar, score: sorted[2].score, accuracy: Math.round((sorted[2].correctCount / room.questions.length) * 100) } : null,
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
        }))
      };
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({
      success: true,
      pin: room.pin,
      state: room.state,
      currentQuestionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      playerCount: room.players.size,
      activePlayerCount,
      timeLimit: room.timeLimit,
      remainingMs,
      elapsedMs,
      players: playersList,
      question: currentQ ? {
        question: currentQ.question,
        options: currentQ.options,
        timeLimit: room.timeLimit,
        unit: currentQ.unit || '',
        difficulty: currentQ.difficulty || ''
      } : null,
      player: player ? {
        nickname: player.nickname,
        score: player.score,
        streak: player.streak,
        answered: room.answers.has(sessionToken)
      } : null,
      resultSnapshot,
      leaderboardSnapshot,
      gameOverSnapshot
    }));
    return;
  }

  // Host Action Control API via REST (Start, Next, Pause, Resume, Results)
  if (pathname === '/api/host/action' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_POST_BYTES) req.destroy();
    });
    req.on('end', () => {
      try {
        const { pin, hostToken, action, questionIndex } = JSON.parse(body || '{}');
        const room = gameManager.getRoom(pin);
        if (!room || room.hostToken !== hostToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Unauthorized or room not found' }));
          return;
        }

        if (action === 'start') {
          gameManager.startGame(pin, hostToken);
        } else if (action === 'next_question') {
          gameManager.nextQuestion(room);
        } else if (action === 'pause_timer') {
          gameManager.pauseQuestion(room);
        } else if (action === 'resume_timer') {
          gameManager.resumeQuestion(room);
        } else if (action === 'skip_timer' || action === 'end_question_now') {
          gameManager.forceEndQuestion(room);
        } else if (action === 'prev_question') {
          gameManager.prevQuestion(pin, hostToken);
        } else if (action === 'jump_question') {
          gameManager.jumpToQuestion(pin, hostToken, questionIndex);
        } else if (action === 'show_leaderboard') {
          gameManager.showLeaderboard(room);
        } else if (action === 'end_game') {
          gameManager.endGame(room);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, state: room.state }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/submit_answer' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_POST_BYTES) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        console.log(`[REST Submit API] Received answer from pin="${data.pin}", sessionToken="${data.sessionToken}", option=${data.optionIndex}`);
        let room = data.pin ? gameManager.getRoom(data.pin) : null;
        if (!room && data.sessionToken) {
          room = gameManager.getRoomBySessionToken(data.sessionToken);
        }
        if (room && data.sessionToken) {
          const rec = gameManager.submitAnswer(room, data.sessionToken, data.optionIndex);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          });
          res.end(JSON.stringify({ success: true, answer: rec }));
        } else {
          console.warn(`[REST Submit API] Room not found for pin="${data.pin}", token="${data.sessionToken}"`);
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Room or player session not found' }));
        }
      } catch (err) {
        console.error(`[REST Submit API Error]`, err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Static File Serving (Sub-millisecond delivery from In-Memory RAM Cache with ETag & Gzip)
  let targetPath = pathname;
  if (targetPath === '' || targetPath === '/') targetPath = '/';
  else if (targetPath === '/host') targetPath = '/host';

  const cached = staticCache.get(targetPath);
  if (cached) {
    const isHtml = cached.ext === '.html';
    const cacheControl = isHtml ? 'no-cache' : 'public, max-age=3600';
    const clientEtag = req.headers['if-none-match'];

    // HTTP 304 Not Modified conditional validation
    if (clientEtag && clientEtag === cached.etag) {
      res.writeHead(304, {
        'ETag': cached.etag,
        'Cache-Control': cacheControl
      });
      res.end();
      return;
    }

    const acceptEncoding = req.headers['accept-encoding'] || '';
    if (cached.gzipBuffer && acceptEncoding.includes('gzip')) {
      res.writeHead(200, {
        'Content-Type': cached.contentType,
        'Content-Encoding': 'gzip',
        'Content-Length': cached.gzipBuffer.length,
        'ETag': cached.etag,
        'Cache-Control': cacheControl,
        'Vary': 'Accept-Encoding'
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(cached.gzipBuffer);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': cached.contentType,
        'Content-Length': cached.buffer.length,
        'ETag': cached.etag,
        'Cache-Control': cacheControl
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(cached.buffer);
      }
    }
    return;
  }

  // Safe fallback if a file was added dynamically after server boot
  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (safePath.startsWith(PUBLIC_DIR) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(safePath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

// WebSocket Server
const wss = new WebSocketServer(server);

wss.on('connection', (client) => {
  client.on('message', (messageText) => {
    try {
      const { event, data } = JSON.parse(messageText);

      switch (event) {
        // Host creates a room (requires password 'njnjnj' or valid host token)
        case 'host_create_room': {
          const isPwValid = (data && data.password && data.password.trim() === HOST_PASSWORD) ||
                            (data && data.hostAuthToken && gameManager.validHostAuthTokens.has(data.hostAuthToken));
          if (!isPwValid) {
            client.send({
              event: 'host_auth_error',
              data: { success: false, error: 'Incorrect host password. Access denied.' }
            });
            break;
          }
          const room = gameManager.createRoom(data && data.customPin, client);
          console.log(`🔑 [Host Created Room] Active Game PIN / Code: [ ${room.pin} ]`);
          client.send({
            event: 'host_created',
            data: {
              success: true,
              pin: room.pin,
              hostToken: room.hostToken,
              totalQuestions: room.questions.length,
              state: room.state
            }
          });
          gameManager.broadcastLobbyUpdate(room);
          break;
        }

        // Host reconnects after F5 / reload
        case 'host_reconnect': {
          const result = gameManager.reconnectHost(data.pin, data.hostToken, client);
          if (result.success) {
            console.log(`🔑 [Host Reconnected] Active Game PIN / Code: [ ${data.pin} ]`);
          } else {
            console.log(`[Host Reconnect] Room ${data && data.pin} not found or expired.`);
          }
          client.send({
            event: 'host_reconnect_result',
            data: result
          });
          if (result.success) {
            const room = gameManager.getRoom(data.pin);
            if (room) gameManager.broadcastLobbyUpdate(room);
          }
          break;
        }

        // Student joins the room
        case 'player_join': {
          const result = gameManager.addPlayer(data.pin, client, data.nickname, data.avatar);
          client.send({
            event: 'player_join_result',
            data: result
          });
          break;
        }

        // Student reconnects after F5 / reload
        case 'player_reconnect': {
          const result = gameManager.reconnectPlayer(data.pin, data.sessionToken, client);
          client.send({
            event: 'player_reconnect_result',
            data: result
          });
          break;
        }

        // Host starts quiz
        case 'host_start_game': {
          const result = gameManager.startGame(data.pin, data.hostToken);
          if (!result.success) {
            client.send({ event: 'error_msg', data: { message: result.error } });
          }
          break;
        }

        // Student submits answer
        case 'submit_answer': {
          let room = (data && data.pin) ? gameManager.getRoom(data.pin) : null;
          if (!room && data && data.sessionToken) {
            room = gameManager.getRoomBySessionToken(data.sessionToken);
          }
          if (!room && client.id) {
            // Resilient fallback: find room by client id
            for (const r of gameManager.rooms.values()) {
              if (r.clientToToken && r.clientToToken.has(client.id)) {
                room = r;
                break;
              }
            }
          }
          if (room) {
            const sessionToken = (data && data.sessionToken) || room.clientToToken.get(client.id);
            if (sessionToken) {
              const player = room.players.get(sessionToken);
              if (player) {
                if (player.client !== client) {
                  player.client = client;
                  player.isConnected = true;
                  room.clientToToken.set(client.id, sessionToken);
                }
                gameManager.submitAnswer(room, sessionToken, data.optionIndex);
              }
            }
          } else {
            console.warn(`[Quiz Submit] Room not found for PIN "${data && data.pin}" and token "${data && data.sessionToken}"`);
          }
          break;
        }

        // Host next question
        case 'host_next_question': {
          const room = gameManager.getRoom(data.pin);
          if (room && (room.hostClient === client || room.hostToken === data.hostToken)) {
            gameManager.nextQuestion(room);
          }
          break;
        }

        // Host previous question
        case 'host_prev_question': {
          gameManager.prevQuestion(data.pin, data.hostToken);
          break;
        }

        // Host jump directly to question
        case 'host_jump_question': {
          gameManager.jumpToQuestion(data.pin, data.hostToken, data.questionIndex);
          break;
        }

        // Host pause question timer
        case 'host_pause_timer': {
          gameManager.pauseQuestion(data.pin, data.hostToken);
          break;
        }

        // Host resume question timer
        case 'host_resume_timer': {
          gameManager.resumeQuestion(data.pin, data.hostToken);
          break;
        }

        // Host ends question early / skip timer
        case 'host_skip_timer':
        case 'host_end_question_now': {
          gameManager.forceEndQuestion(data.pin, data.hostToken);
          break;
        }

        // Host ends game early to show podium
        case 'host_end_game_early': {
          const room = gameManager.getRoom(data.pin);
          if (room && (room.hostClient === client || room.hostToken === data.hostToken)) {
            gameManager.endGame(room);
          }
          break;
        }

        // Host reveals leaderboard
        case 'host_show_leaderboard': {
          const room = gameManager.getRoom(data.pin);
          if (room && (room.hostClient === client || room.hostToken === data.hostToken)) {
            gameManager.showLeaderboard(room);
          }
          break;
        }

        // Host kicks a student
        case 'host_kick_player': {
          const room = gameManager.getRoom(data.pin);
          if (room && (room.hostClient === client || room.hostToken === data.hostToken)) {
            const player = room.players.get(data.sessionToken);
            if (player && player.client) {
              player.client.send({
                event: 'kicked',
                data: { reason: 'Removed from lobby by host' }
              });
              player.client.close();
            }
            room.players.delete(data.sessionToken);
            room.answers.delete(data.sessionToken);
            gameManager.broadcastLobbyUpdate(room);
          }
          break;
        }

        // Application-level Heartbeat
        case 'ping': {
          client.send({ event: 'pong' });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Error handling socket message:', err);
    }
  });

  client.on('close', () => {
    gameManager.handleDisconnect(client.id);
  });
});

// Active keep-alive heartbeat with graceful tolerance for mobile tab switches
setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      client.missedHeartbeats = (client.missedHeartbeats || 0) + 1;
      // Allow 2 missed heartbeats (50s) before terminating to protect students on mobile Wi-Fi
      if (client.missedHeartbeats >= 2) {
        if (typeof client.terminate === 'function') {
          client.terminate();
        } else {
          client.close();
        }
        wss.clients.delete(client);
        continue;
      }
    } else {
      client.missedHeartbeats = 0;
    }

    client.isAlive = false;
    if (typeof client.ping === 'function') {
      client.ping();
    } else if (client.socket && !client.socket.destroyed && client.socket.writable) {
      try {
        client.socket.write(Buffer.from([0x89, 0x00]), () => {});
      } catch (e) {
        if (typeof client.terminate === 'function') client.terminate();
        else client.close();
      }
    }
  }
}, 25000);

// Prune abandoned or expired rooms every 30 minutes
setInterval(() => {
  const now = Date.now();
  const FOUR_HOURS = 4 * 60 * 60 * 1000;
  for (const [pin, room] of gameManager.rooms.entries()) {
    if (now - (room.createdAt || 0) > FOUR_HOURS && (room.state === 'GAME_OVER' || room.players.size === 0)) {
      console.log(`🧹 [Cleanup] Pruning inactive room [ ${pin} ]`);
      gameManager.rooms.delete(pin);
    }
  }
}, 30 * 60 * 1000);

// Create initial room so an active Game PIN is ready immediately
const initialRoom = gameManager.createRoom();

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('\n========================================================');
  console.log('🎮 SE QUIZ ARENA - Server Online with Reconnect Resilience!');
  console.log(`🔑 Active Game PIN / Room Code: [ ${initialRoom.pin} ]`);
  console.log(`💻 Student Desktop / Laptop:    http://localhost:${PORT}/`);
  console.log(`🖥️ Host Big Screen View:        http://localhost:${PORT}/host`);
  console.log(`🌐 Local Lab Wi-Fi Join:        http://${localIp}:${PORT}/`);
  console.log(`📡 Local Lab Wi-Fi Host:        http://${localIp}:${PORT}/host`);
  console.log(`⚡ In-Memory Cache:             ${staticCache.size} static routes cached in RAM for 60+ student concurrency`);
  console.log('========================================================\n');
});

process.on('uncaughtException', (err) => {
  if (err && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
    return;
  }
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
