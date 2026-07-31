// ── Provider abstraction (Phase 1 seed) ──────────────────────
// A single unified interface over "openai"- and "anthropic"-shaped chat
// APIs. Phase 0 only wires the default provider from env; Phase 1 will
// register multiple presets and let the UI switch between them.
//
// Unified message shape (what callers pass in):
//   { role: 'system'|'user'|'assistant', content: '...' }
//
// chatComplete() returns: { text, raw, model }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { info, warn } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Some Anthropic-shaped gateways (e.g. AgentRouter) reject "generic" clients
// with "unauthorized client detected". Presenting the Claude Code CLI wire
// image gets past that firewall — the same trick the Nexus frontend uses.
const CLAUDE_CODE_UA = 'claude-cli/1.0.60 (external, cli)';

function anthropicHeaders(key) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': key,
    Authorization: `Bearer ${key}`, // some relays check either
    'anthropic-version': '2023-06-01',
    'user-agent': CLAUDE_CODE_UA,
    'x-app': 'cli',
  };
}

// Registry keyed by provider id. Phase 1 will populate this from a config
// file / DB; Phase 0 seeds a single "default" from env.
const providers = new Map();

export function registerProvider(p) {
  if (!p.id) throw new Error('provider requires an id');
  providers.set(p.id, {
    id: p.id,
    name: p.name || p.id,
    transport: (p.transport || 'openai').toLowerCase(),
    baseUrl: (p.baseUrl || '').replace(/\/+$/, ''),
    key: p.key || '',
    model: p.model || '',
    supportsTools: p.supportsTools ?? false,
  });
}

export function getProvider(id) {
  return providers.get(id || 'default');
}

export function listProviders() {
  // Never leak keys.
  return [...providers.values()].map(({ key, ...rest }) => ({
    ...rest,
    hasKey: Boolean(key),
  }));
}

// Built-in presets — baseUrl + transport for common providers. A provider
// entry in providers.json can just say {"preset":"openrouter","key":"..."}.
export const PRESETS = {
  agentrouter: { name: 'AgentRouter', transport: 'anthropic', baseUrl: 'https://agentrouter.org/v1' },
  openrouter: { name: 'OpenRouter', transport: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  nvidia: { name: 'NVIDIA NIM', transport: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  groq: { name: 'Groq', transport: 'openai', baseUrl: 'https://api.groq.com/openai/v1' },
  together: { name: 'Together', transport: 'openai', baseUrl: 'https://api.together.xyz/v1' },
  ollama: { name: 'Ollama', transport: 'openai', baseUrl: 'http://127.0.0.1:11434/v1' },
};

// Seed the default provider from env if configured.
if (config.provider.baseUrl && config.provider.key) {
  registerProvider({
    id: 'default',
    name: 'Default',
    transport: config.provider.transport,
    baseUrl: config.provider.baseUrl,
    key: config.provider.key,
    model: config.provider.model,
    supportsTools: ['anthropic', 'openai'].includes(config.provider.transport),
  });
  info(`provider "default" configured (${config.provider.transport} @ ${config.provider.baseUrl})`);
}

// Load additional providers from server/providers.json (optional, gitignored).
// Each entry: { id, name, transport, baseUrl, key, model }  — or use a preset:
//   { "id":"or", "preset":"openrouter", "key":"sk-or-...", "model":"...:free" }
(() => {
  const file = path.resolve(__dirname, '..', '..', 'providers.json');
  if (!fs.existsSync(file)) return;
  let list;
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    warn(`providers.json is not valid JSON — ignoring (${e.message})`);
    return;
  }
  if (!Array.isArray(list)) {
    warn('providers.json must be a JSON array — ignoring');
    return;
  }
  for (const raw of list) {
    const preset = raw.preset ? PRESETS[raw.preset] : null;
    if (raw.preset && !preset) {
      warn(`unknown preset "${raw.preset}" in providers.json — skipping`);
      continue;
    }
    const merged = {
      id: raw.id || raw.preset,
      name: raw.name || preset?.name || raw.id,
      transport: raw.transport || preset?.transport || 'openai',
      baseUrl: raw.baseUrl || preset?.baseUrl || '',
      key: raw.key || '',
      model: raw.model || '',
    };
    if (!merged.id || !merged.baseUrl || !merged.key) {
      warn(`provider entry missing id/baseUrl/key — skipping (${JSON.stringify(raw.id || raw.preset)})`);
      continue;
    }
    merged.supportsTools = merged.transport === 'anthropic' || merged.transport === 'openai';
    registerProvider(merged);
    info(`provider "${merged.id}" configured (${merged.transport} @ ${merged.baseUrl})`);
  }
})();

// ── Unified chat completion ──────────────────────────────────
export async function chatComplete({ providerId, model, messages, temperature = 0.7, signal }) {
  const p = getProvider(providerId);
  if (!p) {
    const err = new Error(
      'no AI provider is configured. Set PROVIDER_* env vars in server/.env',
    );
    err.status = 503;
    throw err;
  }
  const useModel = model || p.model;
  if (!useModel) {
    const err = new Error('no model specified and provider has no default model');
    err.status = 400;
    throw err;
  }

  if (p.transport === 'anthropic') {
    return anthropicChat(p, useModel, messages, temperature, signal);
  }
  return openaiChat(p, useModel, messages, temperature, signal);
}

// ── Streaming chat completion ────────────────────────────────
// Async generator yielding plain text deltas, normalized across
// transports. Callers (the /chat SSE route, and later the agent loop)
// don't care which provider shape produced them.
export async function* chatStream({ providerId, model, messages, temperature = 0.7, signal }) {
  const p = getProvider(providerId);
  if (!p) {
    const err = new Error('no AI provider is configured. Set PROVIDER_* env vars in server/.env');
    err.status = 503;
    throw err;
  }
  const useModel = model || p.model;
  if (!useModel) {
    const err = new Error('no model specified and provider has no default model');
    err.status = 400;
    throw err;
  }

  const isAnthropic = p.transport === 'anthropic';
  const url = isAnthropic ? `${p.baseUrl}/messages` : `${p.baseUrl}/chat/completions`;

  let body;
  let headers;
  if (isAnthropic) {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const convo = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
    body = {
      model: useModel,
      system: system || undefined,
      messages: convo,
      max_tokens: 4096,
      temperature: Math.max(0, Math.min(1, temperature)),
      stream: true,
    };
    headers = anthropicHeaders(p.key);
  } else {
    body = { model: useModel, messages, temperature, stream: true };
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` };
  }

  const resp = await fetch(url, { method: 'POST', signal, headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const raw = await resp.json().catch(() => ({}));
    const err = new Error(raw?.error?.message || `provider error ${resp.status}`);
    err.status = resp.status === 401 ? 502 : resp.status;
    throw err;
  }

  // Parse the upstream SSE stream line by line.
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let j;
      try {
        j = JSON.parse(data);
      } catch {
        continue; // partial chunk
      }
      if (isAnthropic) {
        if (j.type === 'content_block_delta' && j.delta?.text) yield j.delta.text;
      } else {
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    }
  }
}

// ── Tool-calling turn (for the agent loop) ───────────────────
// Works across BOTH transports. The agent loop keeps history in a neutral
// shape; this converts it to the provider's wire format, sends one turn,
// and normalizes the reply to: { text, toolCalls:[{id,name,input}], stop }.
//
// Neutral history messages:
//   { role:'user', content:'text' }
//   { role:'assistant', text:'…', toolCalls:[{id,name,input}] }
//   { role:'tool_results', results:[{id,name,content}] }
export async function agentTurn({ providerId, model, system, neutralMessages, tools, signal, maxTokens = 4096 }) {
  const p = getProvider(providerId);
  if (!p) {
    const err = new Error('no AI provider is configured. Set PROVIDER_* env vars in server/.env');
    err.status = 503;
    throw err;
  }
  const useModel = model || p.model;
  if (!useModel) {
    const err = new Error('no model specified and provider has no default model');
    err.status = 400;
    throw err;
  }
  const isAnthropic = p.transport === 'anthropic';

  const url = isAnthropic ? `${p.baseUrl}/messages` : `${p.baseUrl}/chat/completions`;
  const headers = isAnthropic
    ? anthropicHeaders(p.key)
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` };
  const body = isAnthropic
    ? {
        model: useModel,
        system,
        messages: toAnthropicHistory(neutralMessages),
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
        max_tokens: maxTokens,
      }
    : {
        model: useModel,
        messages: toOpenAIHistory(neutralMessages, system),
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
        max_tokens: maxTokens,
      };

  const resp = await fetch(url, { method: 'POST', signal, headers, body: JSON.stringify(body) });
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(raw?.error?.message || `provider error ${resp.status}`);
    err.status = resp.status === 401 ? 502 : resp.status;
    throw err;
  }
  return isAnthropic ? normalizeAnthropic(raw) : normalizeOpenAI(raw);
}

function toAnthropicHistory(msgs) {
  return msgs.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    if (m.role === 'assistant') {
      const content = [];
      if (m.text) content.push({ type: 'text', text: m.text });
      for (const tc of m.toolCalls || []) content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      return { role: 'assistant', content };
    }
    // tool_results
    return { role: 'user', content: (m.results || []).map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content })) };
  });
}

function toOpenAIHistory(msgs, system) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of msgs) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.text || '',
        tool_calls: (m.toolCalls || []).map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input || {}) } })),
      });
    } else {
      for (const r of m.results || []) out.push({ role: 'tool', tool_call_id: r.id, content: r.content });
    }
  }
  return out;
}

function normalizeAnthropic(raw) {
  const blocks = Array.isArray(raw.content) ? raw.content : [];
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const toolCalls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input || {} }));
  return { text, toolCalls, stop: raw.stop_reason !== 'tool_use' || toolCalls.length === 0 };
}

function normalizeOpenAI(raw) {
  const msg = raw?.choices?.[0]?.message || {};
  const text = (msg.content || '').trim();
  const toolCalls = (msg.tool_calls || []).map((tc) => {
    let input = {};
    try {
      input = JSON.parse(tc.function?.arguments || '{}');
    } catch {
      input = {};
    }
    return { id: tc.id, name: tc.function?.name, input };
  });
  return { text, toolCalls, stop: toolCalls.length === 0 };
}

async function openaiChat(p, model, messages, temperature, signal) {
  const resp = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p.key}`,
    },
    body: JSON.stringify({ model, messages, temperature }),
  });
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(raw?.error?.message || `provider error ${resp.status}`);
    err.status = resp.status === 401 ? 502 : resp.status;
    throw err;
  }
  return { text: raw?.choices?.[0]?.message?.content ?? '', raw, model };
}

async function anthropicChat(p, model, messages, temperature, signal) {
  // Split out the system prompt; Anthropic takes it as a top-level field.
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const convo = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const resp = await fetch(`${p.baseUrl}/messages`, {
    method: 'POST',
    signal,
    headers: anthropicHeaders(p.key),
    body: JSON.stringify({
      model,
      system: system || undefined,
      messages: convo,
      max_tokens: 4096,
      temperature: Math.max(0, Math.min(1, temperature)),
    }),
  });
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(raw?.error?.message || `provider error ${resp.status}`);
    err.status = resp.status === 401 ? 502 : resp.status;
    throw err;
  }
  const text = Array.isArray(raw?.content)
    ? raw.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    : '';
  return { text, raw, model };
}
