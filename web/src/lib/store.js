// Config + session persistence (localStorage), ported from the original app.
const LS = 'nexus_agentrouter_v1';
const SS = 'nexus_sessions_v1';

export const DEFAULT_CFG = {
  key: '',
  baseUrl: 'https://agentrouter.org/v1',
  model: 'claude-opus-4-8',
  modelLabel: 'Claude Opus 4.8',
  sys: '',
  temp: 0.7,
  maxTok: 2048,
  mode: 'auto', // auto | anthropic | openai (direct transport)
  proxy: 'https://claudeai.monsiakhatun.workers.dev',
  conn: 'direct', // direct | backend
  backendUrl: '',
  backendToken: '',
  agentMode: false,
  providerId: '',
  autoApprove: false,
};

export function loadCfg() {
  let cfg = { ...DEFAULT_CFG };
  try {
    const s = JSON.parse(localStorage.getItem(LS));
    if (s) cfg = { ...cfg, ...s };
  } catch {}
  if (!cfg.proxy) cfg.proxy = DEFAULT_CFG.proxy;
  // Served from the VPS backend → default to backend mode pointed at origin.
  if (location.protocol.startsWith('http') && !cfg.backendUrl) {
    cfg.backendUrl = location.origin;
    cfg.conn = 'backend';
  }
  return cfg;
}

export function saveCfg(cfg) {
  try {
    localStorage.setItem(LS, JSON.stringify(cfg));
  } catch {}
}

export function loadSessions() {
  try {
    const s = JSON.parse(localStorage.getItem(SS));
    if (Array.isArray(s)) return s;
  } catch {}
  return [];
}

export function saveSessions(sessions) {
  try {
    localStorage.setItem(SS, JSON.stringify(sessions));
  } catch {}
}

export function loadTheme() {
  return localStorage.getItem('nexus_theme') === 'light' ? 'light' : 'dark';
}
export function saveTheme(t) {
  localStorage.setItem('nexus_theme', t);
}
