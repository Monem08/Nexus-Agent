// ── Provider abstraction (Phase 1 seed) ──────────────────────
// A single unified interface over "openai"- and "anthropic"-shaped chat
// APIs. Phase 0 only wires the default provider from env; Phase 1 will
// register multiple presets and let the UI switch between them.
//
// Unified message shape (what callers pass in):
//   { role: 'system'|'user'|'assistant', content: '...' }
//
// chatComplete() returns: { text, raw, model }

import config from '../config.js';
import { info } from '../logger.js';

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

// Seed the default provider from env if configured.
if (config.provider.baseUrl && config.provider.key) {
  registerProvider({
    id: 'default',
    name: 'Default',
    transport: config.provider.transport,
    baseUrl: config.provider.baseUrl,
    key: config.provider.key,
    model: config.provider.model,
    supportsTools: false,
  });
  info(`provider "default" configured (${config.provider.transport} @ ${config.provider.baseUrl})`);
}

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
