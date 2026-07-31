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
import { safeResolve, toWorkspaceRel, WORKSPACE_ROOT } from '../security.js';

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
];

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

const EXECUTORS = {
  list_files: listFiles,
  read_file: readFile,
  search_code: searchCode,
};

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
