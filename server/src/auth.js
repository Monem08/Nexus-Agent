// ── Auth + rate limiting middleware ──────────────────────────

import { tokenMatches } from './security.js';
import config from './config.js';
import { audit, warn } from './logger.js';

// Extract a bearer token from an Authorization header (or ?token= for WS,
// which cannot always set headers from a browser).
export function extractToken(req) {
  const header = req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (m) return m[1].trim();

  // Fallback for WebSocket upgrades from browsers.
  try {
    const url = new URL(req.url, 'http://localhost');
    const q = url.searchParams.get('token');
    if (q) return q;
  } catch {
    /* ignore */
  }
  return null;
}

// Express middleware.
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!tokenMatches(token || '')) {
    audit('auth_fail', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ── Simple fixed-window rate limiter (per IP) ────────────────
const hits = new Map(); // ip -> { count, resetAt }

export function rateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.ip || 'unknown';
  let entry = hits.get(ip);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + config.rateWindowMs };
    hits.set(ip, entry);
  }
  entry.count += 1;

  if (entry.count > config.rateMax) {
    const retry = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retry));
    warn(`rate limit hit for ${ip}`);
    return res.status(429).json({ error: 'rate limit exceeded', retryAfter: retry });
  }
  next();
}

// Periodic cleanup so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of hits) if (now >= e.resetAt) hits.delete(ip);
}, 60000).unref();
