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

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      appName: 'SE Quiz Game Arena',
      version: '1.0.0',
      joinDomain: cleanDomain,
      port: PORT,
      activeRooms: gameManager.rooms.size
    }));
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

  if (pathname === '/api/host/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body || '{}');
        if (password && password.trim() === HOST_PASSWORD) {
          const hostAuthToken = crypto.randomBytes(16).toString('hex');
          gameManager.validHostAuthTokens.add(hostAuthToken);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, hostAuthToken }));
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

  if (pathname === '/api/submit_answer' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
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

// Keep-alive heartbeat to maintain 60+ active school lab connections
setInterval(() => {
  for (const client of wss.clients) {
    if (client.socket && !client.socket.destroyed && client.socket.writable) {
      try {
        client.socket.write(Buffer.from([0x89, 0x00])); // WS Ping frame
      } catch (e) {}
    }
  }
}, 20000);

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('\n========================================================');
  console.log('🎮 SE QUIZ ARENA - Server Online with Reconnect Resilience!');
  console.log(`💻 Student Desktop / Laptop: http://localhost:${PORT}/`);
  console.log(`🖥️ Host Big Screen View:     http://localhost:${PORT}/host`);
  console.log(`🌐 Local Lab Wi-Fi Join:     http://${localIp}:${PORT}/`);
  console.log(`📡 Local Lab Wi-Fi Host:     http://${localIp}:${PORT}/host`);
  console.log(`⚡ In-Memory Cache:          ${staticCache.size} static routes cached in RAM for 60+ student concurrency`);
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
