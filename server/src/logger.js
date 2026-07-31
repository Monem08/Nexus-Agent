// ── Logger ───────────────────────────────────────────────────
// Console logging + an append-only audit trail of every command the
// agent runs (Security Checklist: "Logs of every command the agent runs").

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '..', 'logs');
const AUDIT_FILE = path.join(LOG_DIR, 'audit.log');

fs.mkdirSync(LOG_DIR, { recursive: true });

function ts() {
  return new Date().toISOString();
}

export function info(...args) {
  console.log(`[${ts()}]`, ...args);
}

export function warn(...args) {
  console.warn(`[${ts()}] ⚠`, ...args);
}

export function error(...args) {
  console.error(`[${ts()}] ✗`, ...args);
}

// Structured, append-only audit record. Never throws into the request path.
export function audit(event, data = {}) {
  const line = JSON.stringify({ ts: ts(), event, ...data }) + '\n';
  try {
    fs.appendFileSync(AUDIT_FILE, line);
  } catch (e) {
    console.error(`[${ts()}] ✗ audit write failed:`, e.message);
  }
  // Also surface exec/blocked events to the console for live tailing.
  if (event === 'exec' || event === 'blocked') {
    console.log(`[${ts()}] AUDIT ${event}:`, JSON.stringify(data));
  }
}

export const AUDIT_PATH = AUDIT_FILE;
