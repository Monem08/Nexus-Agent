// ── Nexus Agent — Phase 0 backend entry point ────────────────
// Express + ws. Every route below /  (except /health) requires the
// bearer token and is rate limited. The server binds to loopback by
// default; expose it only through Cloudflare Tunnel / Caddy.

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

import config from './config.js';
import { requireAuth, rateLimit } from './auth.js';
import { WORKSPACE_ROOT } from './security.js';
import { attachStream } from './stream.js';
import { info, warn } from './logger.js';

import chatRoutes from './routes/chat.js';
import fileRoutes from './routes/files.js';
import execRoutes from './routes/exec.js';
import agentRoutes from './routes/agent.js';
import providerRoutes from './routes/providers.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // behind Cloudflare Tunnel / Caddy
app.use(express.json({ limit: '10mb' }));

// ── CORS (explicit allowlist) ────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = config.corsOrigins;
  if (origin && (allowed.includes('*') || allowed.includes(origin))) {
    res.set('Access-Control-Allow-Origin', allowed.includes('*') ? '*' : origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Public health check (no auth) ────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nexus-agent', workspace: WORKSPACE_ROOT });
});

// ── Serve the Nexus frontend (no auth) ───────────────────────
// Open the tunnel URL in a browser and the chat page loads, served from
// the same origin as the backend — so it defaults to backend mode with
// no CORS to configure. The AGENT_TOKEN is still entered by the user.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBDIST = path.resolve(__dirname, '..', 'webdist'); // built Vite + React app
const LEGACY_HTML = path.resolve(__dirname, '..', '..', 'nexus-agentrouter-chat-4.html');
const HAS_REACT = fs.existsSync(path.join(WEBDIST, 'index.html'));

// Serve the built React app's static assets (hashed files under /assets).
if (HAS_REACT) app.use(express.static(WEBDIST, { index: false, maxAge: '1h' }));

app.get(['/', '/app'], (_req, res) => {
  if (HAS_REACT) return res.sendFile(path.join(WEBDIST, 'index.html'));
  if (fs.existsSync(LEGACY_HTML)) return res.sendFile(LEGACY_HTML);
  res.status(404).send('frontend not built — run `npm run build` in web/');
});
// The original single-file UI stays reachable at /legacy as a fallback.
app.get('/legacy', (_req, res) => {
  if (fs.existsSync(LEGACY_HTML)) return res.sendFile(LEGACY_HTML);
  res.status(404).send('legacy html not found');
});

// ── PWA: app icon + manifest (so the phone can "Add to Home Screen") ──
const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">' +
  '<rect width="512" height="512" rx="112" fill="#0a0e14"/>' +
  '<circle cx="256" cy="132" r="28" fill="#2de2c6"/>' +
  '<text x="256" y="372" font-family="monospace" font-size="248" font-weight="700" fill="#2de2c6" text-anchor="middle">N</text>' +
  '</svg>';
app.get('/icon.svg', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400').type('image/svg+xml').send(ICON_SVG);
});
app.get(['/manifest.webmanifest', '/manifest.json'], (_req, res) => {
  res.json({
    name: 'Nexus Agent',
    short_name: 'Nexus',
    description: 'Your personal AI coding agent',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0e14',
    theme_color: '#0a0e14',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
  });
});

// ── Everything else: auth + rate limit ───────────────────────
app.use(rateLimit);
app.use(requireAuth);

app.use(chatRoutes);
app.use(fileRoutes);
app.use(execRoutes);
app.use(agentRoutes);
app.use(providerRoutes);

// 404 + error handler
app.use((_req, res) => res.status(404).json({ error: 'not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  warn('unhandled error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
});

const server = http.createServer(app);
attachStream(server);

server.listen(config.port, config.host, () => {
  info(`Nexus Agent backend listening on http://${config.host}:${config.port}`);
  info(`workspace jail: ${WORKSPACE_ROOT}`);
  if (config.corsOrigins.includes('*')) {
    warn('CORS is open ("*"). Set CORS_ORIGINS to your UI origin in production.');
  }
});

// Graceful shutdown for PM2 restarts.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    info(`${sig} received — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
