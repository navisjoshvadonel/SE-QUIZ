// server/server.js
// High-performance Zero-Dependency Quiz Server with Resilient Session Reconnection
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('./miniWs');
const GameManager = require('./gameManager');

const PORT = process.env.PORT || 3000;
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

  // Static File Serving
  let filePath = '';
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(__dirname, '../public/index.html');
  } else if (pathname === '/host' || pathname === '/host.html') {
    filePath = path.join(__dirname, '../public/host.html');
  } else {
    filePath = path.join(__dirname, '../public', pathname);
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// WebSocket Server
const wss = new WebSocketServer(server);

wss.on('connection', (client) => {
  client.on('message', (messageText) => {
    try {
      const { event, data } = JSON.parse(messageText);

      switch (event) {
        // Host creates a room
        case 'host_create_room': {
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
          const room = gameManager.getRoom(data.pin);
          if (room) {
            const sessionToken = data.sessionToken || room.clientToToken.get(client.id);
            if (sessionToken) {
              gameManager.submitAnswer(room, sessionToken, data.optionIndex);
            }
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
  console.log(`📱 Player Mobile / Web: http://localhost:${PORT}/`);
  console.log(`🖥️ Host Big Screen View: http://localhost:${PORT}/host`);
  console.log(`🌐 Local Wi-Fi Join:     http://${localIp}:${PORT}/`);
  console.log(`📡 Local Wi-Fi Host:     http://${localIp}:${PORT}/host`);
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
