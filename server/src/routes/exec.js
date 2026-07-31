// ── POST /exec ───────────────────────────────────────────────
// Run a terminal command INSIDE the workspace jail. Guarded by:
//   • command blacklist / optional allowlist (security.js)
//   • cwd forced to the workspace (or a safe subdir)
//   • hard timeout + output cap
//   • full audit log of every command
// Output streams live to /stream subscribers as it arrives.

import { Router } from 'express';
import { spawn } from 'node:child_process';
import { assertCommandAllowed, safeResolve, toWorkspaceRel, WORKSPACE_ROOT } from '../security.js';
import config from '../config.js';
import { publish } from '../bus.js';
import { audit, warn } from '../logger.js';

const router = Router();

const MAX_OUTPUT_BYTES = 1 * 1024 * 1024; // 1 MB cap per stream

router.post('/exec', (req, res) => {
  const { cmd, cwd } = req.body || {};

  try {
    assertCommandAllowed(cmd);
  } catch (e) {
    audit('blocked', { cmd, reason: e.message, pattern: e.pattern });
    return res.status(e.status || 403).json({ error: e.message, blocked: true });
  }

  // Resolve the working directory inside the jail.
  let workdir = WORKSPACE_ROOT;
  if (cwd) {
    try {
      workdir = safeResolve(cwd);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
  }

  const id = `exec_${Date.now().toString(36)}`;
  audit('exec', { id, cmd, cwd: toWorkspaceRel(workdir) });
  publish('exec:start', { id, cmd, cwd: toWorkspaceRel(workdir) });

  // Run under a login-free shell so pipes/globs work, but with the jail cwd.
  const child = spawn('/bin/sh', ['-c', cmd], {
    cwd: workdir,
    env: { ...process.env, HOME: WORKSPACE_ROOT },
    timeout: config.execTimeoutMs,
    killSignal: 'SIGKILL',
  });

  let stdout = '';
  let stderr = '';
  let truncated = false;

  const collect = (buf, which) => {
    const chunk = buf.toString();
    if (which === 'out') {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk;
      else truncated = true;
    } else {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk;
      else truncated = true;
    }
    publish('exec:output', { id, stream: which, chunk });
  };

  child.stdout.on('data', (b) => collect(b, 'out'));
  child.stderr.on('data', (b) => collect(b, 'err'));

  child.on('error', (err) => {
    warn(`exec spawn error: ${err.message}`);
    publish('exec:done', { id, error: err.message });
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  child.on('close', (code, signal) => {
    const timedOut = signal === 'SIGKILL' && code === null;
    audit('exec_done', { id, code, signal, truncated, timedOut });
    publish('exec:done', { id, code, signal, truncated, timedOut });
    if (!res.headersSent) {
      res.json({
        id,
        code,
        signal,
        stdout,
        stderr,
        truncated,
        timedOut,
      });
    }
  });
});

export default router;
