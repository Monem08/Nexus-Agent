// ── Agent tools (Phase 2 — read-only v1) ─────────────────────
// The "hands" the agent can choose to use. This first version is
// deliberately read-only and safe: look around, read, search. Writing
// files and running commands come next, gated behind approval.
//
// Each tool: an Anthropic-style spec (name/description/input_schema) the
// model sees, plus an async executor that runs inside the workspace jail
// and returns a plain-text result the model reads back.

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { safeResolve, toWorkspaceRel, WORKSPACE_ROOT, assertCommandAllowed } from '../security.js';
import config from '../config.js';
import { audit } from '../logger.js';

const IGNORED = new Set(['.git', 'node_modules', '.cache']);
const MAX_READ_BYTES = 512 * 1024; // 512 KB per read fed back to the model
const MAX_SEARCH_HITS = 60;

// Tool specifications sent to the model.
export const TOOL_SPECS = [
  {
    name: 'list_files',
    description:
      'List the files and sub-folders inside a directory of the project workspace. Use "." for the workspace root. Returns names, marking folders with a trailing slash.',
    input_schema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Directory path relative to the workspace root. Defaults to ".".' },
      },
      required: [],
    },
  },
  {
    name: 'read_file',
    description: 'Read and return the full text contents of a file in the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace root.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_code',
    description:
      'Search the whole workspace for a piece of text and return matching files with the matching line. Good for locating where something is defined or used.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The text to search for (plain substring, case-insensitive).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'write_file',
    description:
      'Create a new file or overwrite an existing one with the given full contents. Read the file first if you are changing it, and provide the complete new content (not a fragment).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace root.' },
        content: { type: 'string', description: 'The full text to write into the file.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_command',
    description:
      'Run a shell command inside the project workspace and return its output. Use for builds, tests, installs, git, etc. Dangerous commands are blocked by the server.',
    input_schema: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: 'The shell command to run.' },
      },
      required: ['cmd'],
    },
  },
];

// Tools that change the system — these pause for user approval.
export const MUTATING = new Set(['write_file', 'run_command']);

// ── Executors ────────────────────────────────────────────────
async function listFiles({ dir }) {
  const abs = safeResolve(dir || '.');
  const entries = await fs.readdir(abs, { withFileTypes: true });
  if (!entries.length) return `(empty directory: ${toWorkspaceRel(abs)})`;
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const lines = entries
    .filter((e) => !IGNORED.has(e.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  return `Contents of ${toWorkspaceRel(abs)}:\n` + lines.join('\n');
}

async function readFile({ path: p }) {
  const abs = safeResolve(p);
  const stat = await fs.stat(abs);
  if (!stat.isFile()) return `Error: ${toWorkspaceRel(abs)} is not a file.`;
  if (stat.size > MAX_READ_BYTES) {
    return `Error: file is too large to read (${stat.size} bytes, limit ${MAX_READ_BYTES}).`;
  }
  const content = await fs.readFile(abs, 'utf8');
  return `File ${toWorkspaceRel(abs)} (${stat.size} bytes):\n\n${content}`;
}

async function searchCode({ query }) {
  if (!query || !query.trim()) return 'Error: query is required.';
  const needle = query.toLowerCase();
  const hits = [];

  async function walk(dir, depth) {
    if (depth > 10 || hits.length >= MAX_SEARCH_HITS) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (IGNORED.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs, depth + 1);
      } else if (e.isFile()) {
        let text;
        try {
          const stat = await fs.stat(abs);
          if (stat.size > MAX_READ_BYTES) continue;
          text = await fs.readFile(abs, 'utf8');
        } catch {
          continue;
        }
        const lines = text.split('\n');
        for (let i = 0; i < lines.length && hits.length < MAX_SEARCH_HITS; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            hits.push(`${toWorkspaceRel(abs)}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
          }
        }
      }
    }
  }

  await walk(WORKSPACE_ROOT, 0);
  if (!hits.length) return `No matches for "${query}".`;
  const capped = hits.length >= MAX_SEARCH_HITS ? ` (showing first ${MAX_SEARCH_HITS})` : '';
  return `Matches for "${query}"${capped}:\n` + hits.join('\n');
}

async function writeFile({ path: p, content }) {
  if (typeof content !== 'string') return 'Error: content must be a string.';
  const abs = safeResolve(p);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const existed = await fileExists(abs);
  await fs.writeFile(abs, content, 'utf8');
  const rel = toWorkspaceRel(abs);
  audit('agent_write', { path: rel, bytes: Buffer.byteLength(content), overwrite: existed });
  return `${existed ? 'Overwrote' : 'Created'} ${rel} (${Buffer.byteLength(content)} bytes).`;
}

function runCommand({ cmd }) {
  return new Promise((resolve) => {
    try {
      assertCommandAllowed(cmd);
    } catch (e) {
      resolve(`Blocked: ${e.message}`);
      return;
    }
    audit('agent_exec', { cmd });
    const child = spawn('/bin/sh', ['-c', cmd], {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, HOME: WORKSPACE_ROOT },
      timeout: config.execTimeoutMs,
      killSignal: 'SIGKILL',
    });
    let out = '';
    const cap = (b) => {
      if (out.length < 200 * 1024) out += b.toString();
    };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    child.on('error', (err) => resolve(`Failed to start command: ${err.message}`));
    child.on('close', (code, signal) => {
      const timedOut = signal === 'SIGKILL' && code === null;
      const tail = out.trim() || '(no output)';
      resolve(`$ ${cmd}\n[exit ${code ?? 'killed'}${timedOut ? ', timed out' : ''}]\n${tail}`);
    });
  });
}

async function fileExists(abs) {
  try {
    await fs.stat(abs);
    return true;
  } catch {
    return false;
  }
}

const EXECUTORS = {
  list_files: listFiles,
  read_file: readFile,
  search_code: searchCode,
  write_file: writeFile,
  run_command: runCommand,
};

// Build a human-readable preview of a mutating action for the approval card.
// For write_file this is a unified-style line diff; for run_command, the cmd.
export async function previewAction(name, input) {
  if (name === 'run_command') {
    return { kind: 'command', title: input?.cmd || '', body: '' };
  }
  if (name === 'write_file') {
    const abs = safeResolve(input.path);
    const rel = toWorkspaceRel(abs);
    let oldText = '';
    let existed = false;
    try {
      oldText = await fs.readFile(abs, 'utf8');
      existed = true;
    } catch {
      /* new file */
    }
    return {
      kind: 'diff',
      title: `${existed ? 'Overwrite' : 'Create'} ${rel}`,
      body: lineDiff(oldText, input.content || ''),
    };
  }
  return { kind: 'text', title: name, body: JSON.stringify(input) };
}

// Compact LCS line diff → array of "  ", "- ", "+ " prefixed lines (capped).
function lineDiff(oldStr, newStr) {
  const a = oldStr ? oldStr.split('\n') : [];
  const b = newStr ? newStr.split('\n') : [];
  if (a.length > 600 || b.length > 600) {
    // too big to diff cheaply — just show the new content
    return b.slice(0, 200).map((l) => `+ ${l}`).join('\n');
  }
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      lines.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push(`- ${a[i++]}`);
    } else {
      lines.push(`+ ${b[j++]}`);
    }
  }
  while (i < m) lines.push(`- ${a[i++]}`);
  while (j < n) lines.push(`+ ${b[j++]}`);
  return lines.slice(0, 300).join('\n');
}

// Run a tool by name. Never throws — tool errors are returned as text so
// the model can read them and adjust, exactly like a real terminal.
export async function execTool(name, input) {
  const fn = EXECUTORS[name];
  if (!fn) return `Error: unknown tool "${name}".`;
  try {
    return await fn(input || {});
  } catch (e) {
    return `Error running ${name}: ${e.message}`;
  }
}
