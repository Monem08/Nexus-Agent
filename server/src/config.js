// ── Config loader ────────────────────────────────────────────
// Reads environment (via dotenv) into a single frozen config object.
// Fails fast on anything that would make the server unsafe to run.

import 'dotenv/config';
import path from 'node:path';

function req(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`✗ Missing required env var: ${name}`);
    console.error('  Copy server/.env.example to server/.env and fill it in.');
    process.exit(1);
  }
  return v.trim();
}

function num(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function list(name) {
  const v = process.env[name];
  if (!v || !v.trim()) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

const AGENT_TOKEN = req('AGENT_TOKEN');
if (AGENT_TOKEN.length < 24) {
  console.error('✗ AGENT_TOKEN is too short. Use at least 24 chars:');
  console.error('  openssl rand -hex 32');
  process.exit(1);
}

const config = Object.freeze({
  host: process.env.HOST?.trim() || '127.0.0.1',
  port: num('PORT', 8787),

  token: AGENT_TOKEN,

  // Workspace jail root — resolved to an absolute, normalized path.
  workspace: path.resolve(process.env.WORKSPACE?.trim() || '/projects'),

  corsOrigins: list('CORS_ORIGINS').length ? list('CORS_ORIGINS') : ['*'],

  provider: Object.freeze({
    transport: (process.env.PROVIDER_TRANSPORT?.trim() || 'openai').toLowerCase(),
    baseUrl: process.env.PROVIDER_BASE_URL?.trim() || '',
    key: process.env.PROVIDER_KEY?.trim() || '',
    model: process.env.PROVIDER_MODEL?.trim() || '',
  }),

  execTimeoutMs: num('EXEC_TIMEOUT_MS', 120000),
  execAllowlist: list('EXEC_ALLOWLIST'),

  rateWindowMs: num('RATE_WINDOW_MS', 60000),
  rateMax: num('RATE_MAX', 120),
});

export default config;
