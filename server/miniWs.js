// server/miniWs.js
// Ultra-fast zero-dependency RFC 6455 WebSocket Server for Node.js
const EventEmitter = require('events');
const crypto = require('crypto');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function createWsTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

class WebSocketConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.id = 'usr_' + Math.random().toString(36).slice(2, 9);
    this.isAlive = true;
    this.buffer = Buffer.alloc(0);

    this.socket.on('data', (chunk) => this._onData(chunk));
    this.socket.on('close', () => this.emit('close'));
    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    // Default error listener to prevent uncaught error crashes
    this.on('error', (err) => {
      // Cleanly handle socket drops/resets
    });
  }

  send(data) {
    if (this.socket.destroyed || !this.socket.writable) return;
    try {
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      const frame = createWsTextFrame(text);
      this.socket.write(frame, () => {});
    } catch (e) {}
  }

  sendFrame(frameBuffer) {
    if (this.socket.destroyed || !this.socket.writable) return;
    try {
      this.socket.write(frameBuffer, () => {});
    } catch (e) {}
  }

  close() {
    if (!this.socket.destroyed) {
      try {
        this.socket.write(Buffer.from([0x88, 0x00]), () => {
          this.socket.end();
        });
      } catch (e) {
        this.socket.destroy();
      }
    }
  }

  terminate() {
    this.isAlive = false;
    try {
      this.socket.destroy();
    } catch (e) {}
    this.emit('close');
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const byte0 = this.buffer[0];
      const byte1 = this.buffer[1];

      const fin = (byte0 & 0x80) === 0x80;
      const opcode = byte0 & 0x0f;
      const masked = (byte1 & 0x80) === 0x80;
      let payloadLen = byte1 & 0x7f;

      let offset = 2;
      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        payloadLen = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        maskKey = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLen) {
        // Wait for more data
        return;
      }

      const rawPayload = this.buffer.slice(offset, offset + payloadLen);
      this.buffer = this.buffer.slice(offset + payloadLen);

      // Unmask if masked
      if (masked && maskKey) {
        for (let i = 0; i < rawPayload.length; i++) {
          rawPayload[i] ^= maskKey[i % 4];
        }
      }

      // Handle Opcode
      if (opcode === 0x01) {
        // Text frame
        const message = rawPayload.toString('utf8');
        this.emit('message', message);
      } else if (opcode === 0x08) {
        // Connection Close
        this.close();
        return;
      } else if (opcode === 0x09) {
        // RFC 6455 5.5.3: Respond to Ping with Pong containing identical payload
        if (!this.socket.destroyed && this.socket.writable) {
          try {
            const pLen = rawPayload ? rawPayload.length : 0;
            let header;
            if (pLen < 126) {
              header = Buffer.from([0x8A, pLen]);
            } else if (pLen < 65536) {
              header = Buffer.alloc(4);
              header[0] = 0x8A;
              header[1] = 126;
              header.writeUInt16BE(pLen, 2);
            } else {
              header = Buffer.alloc(10);
              header[0] = 0x8A;
              header[1] = 127;
              header.writeBigUInt64BE(BigInt(pLen), 2);
            }
            const pongFrame = pLen > 0 ? Buffer.concat([header, rawPayload]) : header;
            this.socket.write(pongFrame, () => {});
          } catch (e) {}
        }
      } else if (opcode === 0x0A) {
        // Pong received from client (browser response to server heartbeat ping)
        this.isAlive = true;
        this.emit('pong');
      }
    }
  }
}

class WebSocketServer extends EventEmitter {
  constructor(httpServer) {
    super();
    this.clients = new Set();

    httpServer.on('upgrade', (req, socket, head) => {
      const upgrade = req.headers['upgrade'];
      if (!upgrade || !upgrade.toString().toLowerCase().includes('websocket')) {
        socket.destroy();
        return;
      }

      const key = req.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }

      // Disable TCP packet delay (Nagle's algorithm) and enable keep-alive
      try {
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 15000);
      } catch (e) {}

      const acceptKey = crypto
        .createHash('sha1')
        .update(key + WS_GUID)
        .digest('base64');

      const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '\r\n'
      ];

      socket.write(responseHeaders.join('\r\n'));

      const client = new WebSocketConnection(socket);
      this.clients.add(client);

      client.on('close', () => {
        this.clients.delete(client);
      });

      if (head && head.length > 0) {
        client._onData(head);
      }

      this.emit('connection', client, req);
    });
  }

  broadcast(message) {
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    for (const client of this.clients) {
      client.send(text);
    }
  }
}

module.exports = { WebSocketServer, WebSocketConnection, createWsTextFrame };
