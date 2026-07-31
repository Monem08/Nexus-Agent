// ── WS /stream ───────────────────────────────────────────────
// Authenticated WebSocket that pushes live bus events to the phone:
// "reading file X", "running test", exec output, etc. Auth happens at the
// HTTP upgrade so unauthenticated sockets are never established.

import { WebSocketServer } from 'ws';
import { subscribe } from './bus.js';
import { extractToken } from './auth.js';
import { tokenMatches } from './security.js';
import { info } from './logger.js';

export function attachStream(server) {
  // noServer: we gate the upgrade ourselves before creating the socket.
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/stream') {
      socket.destroy();
      return;
    }
    if (!tokenMatches(extractToken(req) || '')) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    info('stream client connected');
    ws.send(JSON.stringify({ type: 'hello', ts: Date.now() }));

    const unsub = subscribe((event) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
    });

    // Keep-alive ping so idle sockets through the tunnel don't drop.
    const ping = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
    }, 30000);

    ws.on('close', () => {
      unsub();
      clearInterval(ping);
      info('stream client disconnected');
    });
    ws.on('error', () => {});
  });

  return wss;
}
