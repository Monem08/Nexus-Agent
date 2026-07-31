// ── Security primitives ──────────────────────────────────────
// Two jobs:
//   1. Workspace jail  — resolve any user path safely inside WORKSPACE.
//   2. Command filter   — reject destructive shell commands.
// Both are defense-in-depth; treat their throws as 4xx, never 5xx.

import path from 'node:path';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import config from './config.js';

// Ensure the workspace root exists so every relative path resolves.
fs.mkdirSync(config.workspace, { recursive: true });

const ROOT = config.workspace;

export class SecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityError';
    this.status = 400;
  }
}

// Resolve `userPath` (relative to the workspace, or absolute) and guarantee
// the result stays inside ROOT. Blocks `..` traversal, absolute escapes,
// and symlink escapes for paths that already exist.
export function safeResolve(userPath) {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new SecurityError('path is required');
  }
  if (userPath.includes('\0')) {
    throw new SecurityError('path contains a null byte');
  }

  // Treat everything as relative to the workspace. An absolute input like
  // "/etc/passwd" is re-anchored under ROOT rather than trusted.
  const rel = userPath.replace(/^[/\\]+/, '');
  const resolved = path.resolve(ROOT, rel);

  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    throw new SecurityError('path escapes the workspace jail');
  }

  // If the path (or its nearest existing ancestor) resolves through a
  // symlink that points outside ROOT, reject it.
  const real = realParent(resolved);
  if (real !== ROOT && !real.startsWith(ROOT + path.sep)) {
    throw new SecurityError('path escapes the workspace jail (symlink)');
  }

  return resolved;
}

// realpath of the deepest existing ancestor of `p`.
function realParent(p) {
  let cur = p;
  // Walk up until we hit something that exists on disk.
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  try {
    return fs.realpathSync(cur);
  } catch {
    return cur;
  }
}

// Path shown to clients — relative to the workspace, forward-slashed.
export function toWorkspaceRel(absPath) {
  const rel = path.relative(ROOT, absPath);
  return rel === '' ? '.' : rel.split(path.sep).join('/');
}

// ── Command filter ───────────────────────────────────────────
// Blacklist of patterns that are never allowed, even inside the jail,
// because they can wreck the host or exfiltrate broadly.
const BLOCKED_PATTERNS = [
  /\brm\s+-[a-z]*r[a-z]*f?\b[\s\S]*(\/(\s|$)|\/\*|~|\$HOME)/i, // rm -rf / , ~ , $HOME
  /\brm\s+-[a-z]*f[a-z]*r?\b[\s\S]*(\/(\s|$)|\/\*|~|\$HOME)/i,
  /\bmkfs\b/i, // format a filesystem
  /\bdd\b[\s\S]*\bof=\/dev\//i, // overwrite a block device
  /\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/i,
  /\(\s*\)\s*\{[^}]*\|[^}]*&[^}]*\}\s*;/, // fork bomb: fn(){ …|…& };  (any name)
  /:\s*\|\s*:\s*&/, // classic fork-bomb body  :|:&
  /\bchmod\s+-R?\s*0*777\s+\/(\s|$)/i, // chmod 777 /
  /\bchown\s+-R\b[\s\S]*\s\/(\s|$)/i,
  />\s*\/dev\/sd[a-z]/i, // write straight to a disk
  /\bmv\s+[\s\S]*\s\/dev\/null\b/i, // mv important -> /dev/null
  /\b(curl|wget)\b[\s\S]*\|\s*(sudo\s+)?(sh|bash)\b/i, // curl … | sh
  /\bwipefs\b/i,
  /\bfdisk\b|\bparted\b/i,
];

export class CommandBlockedError extends Error {
  constructor(message, pattern) {
    super(message);
    this.name = 'CommandBlockedError';
    this.status = 403;
    this.pattern = pattern;
  }
}

// Throws CommandBlockedError if the command is disallowed.
export function assertCommandAllowed(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) {
    throw new SecurityError('command is required');
  }
  if (cmd.includes('\0')) {
    throw new SecurityError('command contains a null byte');
  }

  for (const rx of BLOCKED_PATTERNS) {
    if (rx.test(cmd)) {
      throw new CommandBlockedError(
        'command matched a blocked pattern and was refused',
        rx.source,
      );
    }
  }

  // Optional strict allowlist: the first bare word must be in the list.
  if (config.execAllowlist.length) {
    const first = cmd.trim().split(/\s+/)[0].replace(/^.*\//, ''); // strip any path
    if (!config.execAllowlist.includes(first)) {
      throw new CommandBlockedError(
        `command "${first}" is not in the exec allowlist`,
        'allowlist',
      );
    }
  }
}

// ── Token comparison (constant time) ─────────────────────────
export function tokenMatches(provided) {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(config.token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export { ROOT as WORKSPACE_ROOT };
