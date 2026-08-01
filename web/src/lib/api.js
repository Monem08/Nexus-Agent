// Backend + direct-mode API helpers, ported from the original app.

const CLAUDE_CODE_UA = 'claude-cli/1.0.60 (external, cli)';
const BASE_SYS =
  "You are a helpful AI assistant in a simple chat app. You are NOT a coding agent and have NO tools, terminal, file system, or ability to run commands. Never emit tool calls, JSON command objects, or text like {\"command\": ...}. Never say you'll 'look at the project' or inspect files. Just answer the user's message directly in plain text or markdown.";

export function sysText(cfg) {
  return cfg.sys ? BASE_SYS + '\n\n' + cfg.sys : BASE_SYS;
}
function backendBase(cfg) {
  return (cfg.backendUrl || '').replace(/\/+$/, '');
}
function bearer(cfg) {
  return { Authorization: 'Bearer ' + cfg.backendToken };
}
function proxied(cfg, url) {
  if (!cfg.proxy) return url;
  const p = cfg.proxy.trim().replace(/\/+$/, '');
  if (p.includes('?url=') || p.endsWith('=')) return p + encodeURIComponent(url);
  return p + '/' + url;
}

// Read an SSE body, calling onLine for each `data:` payload (parsed JSON or raw).
async function readSSE(resp, onData, shouldStop) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    if (shouldStop && shouldStop()) {
      try { await reader.cancel(); } catch {}
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const d = t.slice(5).trim();
      if (!d || d === '[DONE]') continue;
      onData(d);
    }
  }
}

// ── Chat (dispatches backend vs direct) ──────────────────────
export async function sendChat({ cfg, messages, onToken, signal }) {
  if (cfg.conn === 'backend') return backendChat({ cfg, messages, onToken, signal });
  return directChat({ cfg, messages, onToken, signal });
}

async function backendChat({ cfg, messages, onToken, signal }) {
  const body = {
    model: cfg.model,
    providerId: cfg.providerId || undefined,
    temperature: cfg.temp,
    stream: true,
    messages: [{ role: 'system', content: sysText(cfg) }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
  };
  const r = await fetch(backendBase(cfg) + '/chat', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...bearer(cfg) },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let d = 'HTTP ' + r.status;
    try { d = (await r.json()).error || d; } catch {}
    throw new Error(d);
  }
  let full = '';
  await readSSE(r, (data) => {
    let j;
    try { j = JSON.parse(data); } catch { return; }
    if (j.error) throw new Error(j.error.message || 'stream error');
    const delta = j.choices?.[0]?.delta?.content || '';
    if (delta) { full += delta; onToken(full); }
  }, () => signal?.aborted);
  return full;
}

function directBuild(cfg, messages, transport) {
  const base = cfg.baseUrl.replace(/\/$/, '');
  const st = sysText(cfg);
  const msgs = messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }));
  if (transport === 'anthropic') {
    return {
      url: base + '/messages',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, Authorization: 'Bearer ' + cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'user-agent': CLAUDE_CODE_UA, 'x-app': 'cli' },
      body: { model: cfg.model, max_tokens: cfg.maxTok, temperature: Math.min(Math.max(cfg.temp, 0), 1), stream: true, system: st, messages: msgs },
    };
  }
  return {
    url: base + '/chat/completions',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key, 'user-agent': CLAUDE_CODE_UA },
    body: { model: cfg.model, messages: [{ role: 'system', content: st }, ...msgs], temperature: cfg.temp, max_tokens: cfg.maxTok, stream: true },
  };
}

function parseDelta(transport, j) {
  if (transport === 'anthropic') {
    if (j.type === 'content_block_delta') return j.delta?.text || '';
    return '';
  }
  return j.choices?.[0]?.delta?.content || '';
}

async function directAttempt(cfg, messages, transport, onToken, signal) {
  const req = directBuild(cfg, messages, transport);
  const r = await fetch(proxied(cfg, req.url), {
    method: 'POST', signal, headers: req.headers, body: JSON.stringify(req.body),
  });
  if (!r.ok) {
    let d = 'HTTP ' + r.status;
    try { const ej = await r.json(); d = ej.error?.message || ej.message || d; } catch {}
    return { ok: false, error: d, text: '' };
  }
  let full = '';
  let err = '';
  await readSSE(r, (data) => {
    let j;
    try { j = JSON.parse(data); } catch { return; }
    if (j.type === 'error' || j.error) { err = j.error?.message || j.error || 'stream error'; return; }
    const delta = parseDelta(transport, j);
    if (delta) { full += delta; onToken(full); }
  }, () => signal?.aborted);
  if (err && !full) return { ok: false, error: err, text: '' };
  return { ok: true, text: full };
}

async function directChat({ cfg, messages, onToken, signal }) {
  const order = cfg.mode === 'anthropic' ? ['anthropic'] : cfg.mode === 'openai' ? ['openai'] : ['anthropic', 'openai'];
  let lastErr = '';
  for (const tr of order) {
    if (signal?.aborted) break;
    const res = await directAttempt(cfg, messages, tr, onToken, signal);
    if (res.ok && res.text.trim()) return res.text;
    lastErr = res.error || 'empty response';
  }
  throw new Error(lastErr || 'request failed');
}

// ── Agent (SSE events) ───────────────────────────────────────
export async function runAgentTask({ cfg, task, onEvent, signal }) {
  const r = await fetch(backendBase(cfg) + '/agent', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...bearer(cfg) },
    body: JSON.stringify({ task, providerId: cfg.providerId || undefined, autoApprove: !!cfg.autoApprove }),
  });
  if (!r.ok) {
    let d = 'HTTP ' + r.status;
    try { d = (await r.json()).error || d; } catch {}
    throw new Error(d);
  }
  await readSSE(r, (data) => {
    let ev;
    try { ev = JSON.parse(data); } catch { return; }
    onEvent(ev);
  }, () => signal?.aborted);
}

export async function approveAgent(cfg, id, approve) {
  try {
    await fetch(backendBase(cfg) + '/agent/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearer(cfg) },
      body: JSON.stringify({ id, decision: approve ? 'approve' : 'reject' }),
    });
  } catch {}
}

// ── Files / providers / health ───────────────────────────────
export async function fetchFiles(cfg) {
  const r = await fetch(backendBase(cfg) + '/files', { headers: bearer(cfg) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).tree || [];
}
export async function uploadFile(cfg, path, content, encoding) {
  const r = await fetch(backendBase(cfg) + '/file/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(cfg) },
    body: JSON.stringify({ path, content, encoding }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}
export async function readFile(cfg, path) {
  const r = await fetch(backendBase(cfg) + '/file/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(cfg) },
    body: JSON.stringify({ path }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j.content ?? '';
}
export async function fetchProviders(cfg) {
  try {
    const r = await fetch(backendBase(cfg) + '/providers', { headers: bearer(cfg) });
    if (!r.ok) return [];
    return (await r.json()).providers || [];
  } catch { return []; }
}
export async function health(cfg) {
  try {
    const r = await fetch(backendBase(cfg) + '/health', { cache: 'no-store' });
    return r.ok;
  } catch { return false; }
}
