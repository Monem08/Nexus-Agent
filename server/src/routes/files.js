// ── File routes ──────────────────────────────────────────────
//   GET  /files                 → workspace file tree
//   POST /file/read  {path}     → file content
//   POST /file/write {path,content} → create / overwrite
// Every path passes through safeResolve() → workspace jail.

import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { safeResolve, toWorkspaceRel, WORKSPACE_ROOT } from '../security.js';
import { publish } from '../bus.js';
import { audit } from '../logger.js';

const router = Router();

const MAX_READ_BYTES = 2 * 1024 * 1024; // 2 MB guard for reads
const IGNORED = new Set(['.git', 'node_modules', '.cache']);

// Recursively build a tree, skipping heavy/irrelevant dirs.
async function buildTree(dir, depth = 0) {
  if (depth > 12) return [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.') && IGNORED.has(e.name)) continue;
    if (IGNORED.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    const rel = toWorkspaceRel(abs);
    if (e.isDirectory()) {
      out.push({ type: 'dir', name: e.name, path: rel, children: await buildTree(abs, depth + 1) });
    } else if (e.isFile()) {
      let size = 0;
      try {
        size = (await fs.stat(abs)).size;
      } catch {
        /* ignore */
      }
      out.push({ type: 'file', name: e.name, path: rel, size });
    }
  }
  return out;
}

router.get('/files', async (_req, res) => {
  try {
    const tree = await buildTree(WORKSPACE_ROOT);
    res.json({ root: '.', tree });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/file/read', async (req, res) => {
  try {
    const abs = safeResolve(req.body?.path);
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return res.status(400).json({ error: 'not a file' });
    if (stat.size > MAX_READ_BYTES) {
      return res.status(413).json({ error: `file too large (> ${MAX_READ_BYTES} bytes)` });
    }
    const content = await fs.readFile(abs, 'utf8');
    res.json({ path: toWorkspaceRel(abs), size: stat.size, content });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: 'file not found' });
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Upload a file into the workspace. Body: { path, content, encoding? }
// encoding "base64" for binary uploads; otherwise content is treated as utf8.
router.post('/file/upload', async (req, res) => {
  const { path: p, content, encoding } = req.body || {};
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required' });
  }
  try {
    const abs = safeResolve(p);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const buf = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
    await fs.writeFile(abs, buf);
    const rel = toWorkspaceRel(abs);
    audit('file_upload', { path: rel, bytes: buf.length });
    publish('file:upload', { path: rel });
    res.json({ ok: true, path: rel, bytes: buf.length });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/file/write', async (req, res) => {
  const { path: p, content } = req.body || {};
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required' });
  }
  try {
    const abs = safeResolve(p);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
    const rel = toWorkspaceRel(abs);
    audit('file_write', { path: rel, bytes: Buffer.byteLength(content) });
    publish('file:write', { path: rel });
    res.json({ ok: true, path: rel, bytes: Buffer.byteLength(content) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export default router;
