import { useState, useEffect, useRef, useCallback } from 'react';
import { loadCfg, saveCfg, loadSessions, saveSessions, loadTheme, saveTheme } from './lib/store.js';
import * as api from './lib/api.js';
import Header from './components/Header.jsx';
import Empty from './components/Empty.jsx';
import Message from './components/Message.jsx';
import Composer from './components/Composer.jsx';
import Settings from './components/Settings.jsx';
import Sidebar from './components/Sidebar.jsx';
import FileExplorer from './components/FileExplorer.jsx';
import ModelPicker from './components/ModelPicker.jsx';
import Toast from './components/Toast.jsx';

let sid = 0;
const newId = (p) => p + Date.now().toString(36) + '_' + (sid++);

export default function App() {
  const [cfg, setCfg] = useState(loadCfg);
  const [theme, setTheme] = useState(loadTheme);
  const [sessions, setSessions] = useState(loadSessions);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [providers, setProviders] = useState([]);
  const [dot, setDot] = useState('idle');
  const [toast, setToast] = useState(null);
  const [files, setFiles] = useState({ tree: [], loading: false, error: '', viewing: null });

  const abortRef = useRef(null);
  const stopRef = useRef(false);
  const mainRef = useRef(null);
  const toastT = useRef(null);

  const updateCfg = useCallback((patch) => setCfg((c) => { const n = { ...c, ...patch }; saveCfg(n); return n; }), []);
  const showToast = useCallback((msg, err) => {
    setToast({ msg, err, show: true });
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2600);
  }, []);

  // ── init: theme + first session ──
  useEffect(() => { document.documentElement.classList.toggle('light', theme === 'light'); }, [theme]);
  useEffect(() => {
    const s = loadSessions();
    if (s.length) { setActiveId(s[0].id); setMessages(s[0].messages || []); }
    else { const ns = { id: newId('s_'), title: 'New chat', messages: [], ts: Date.now() }; setSessions([ns]); setActiveId(ns.id); }
  }, []);

  // persist messages into the active session
  useEffect(() => {
    if (!activeId) return;
    setSessions((ss) => {
      const n = ss.map((s) => {
        if (s.id !== activeId) return s;
        let title = s.title;
        if ((title === 'New chat' || !title) && messages.length) {
          const first = messages.find((m) => m.role === 'user');
          if (first && typeof first.content === 'string') title = first.content.slice(0, 40) + (first.content.length > 40 ? '…' : '');
        }
        return { ...s, messages, title, ts: Date.now() };
      });
      saveSessions(n);
      return n;
    });
  }, [messages, activeId]);

  // autoscroll
  useEffect(() => { const m = mainRef.current; if (m) m.scrollTop = m.scrollHeight; }, [messages]);

  // connection status + providers
  useEffect(() => {
    let stop = false;
    const ping = async () => {
      if (cfg.conn !== 'backend' || !cfg.backendUrl) { setDot('idle'); return; }
      setDot((await api.health(cfg)) ? 'ok' : 'bad');
    };
    ping();
    const iv = setInterval(() => { if (!stop) ping(); }, 20000);
    if (cfg.conn === 'backend' && cfg.backendUrl && cfg.backendToken) api.fetchProviders(cfg).then(setProviders);
    return () => { stop = true; clearInterval(iv); };
  }, [cfg.conn, cfg.backendUrl, cfg.backendToken]);

  // ── sessions ──
  const newChat = () => {
    const ns = { id: newId('s_'), title: 'New chat', messages: [], ts: Date.now() };
    setSessions((s) => [ns, ...s]); setActiveId(ns.id); setMessages([]); setSheet(null);
  };
  const switchChat = (id) => {
    const s = sessions.find((x) => x.id === id); if (!s) return;
    setActiveId(id); setMessages(s.messages || []); setSheet(null);
  };
  const deleteChat = (id) => {
    setSessions((ss) => {
      const n = ss.filter((s) => s.id !== id); saveSessions(n);
      if (id === activeId) {
        if (n.length) { setActiveId(n[0].id); setMessages(n[0].messages || []); }
        else { const ns = { id: newId('s_'), title: 'New chat', messages: [], ts: Date.now() }; setActiveId(ns.id); setMessages([]); return [ns]; }
      }
      return n;
    });
  };

  // ── helpers to mutate the in-flight assistant message ──
  const patchMsg = (idx, fn) => setMessages((m) => { const n = [...m]; if (n[idx]) n[idx] = fn(n[idx]); return n; });

  // ── chat ──
  const sendChat = async (text) => {
    const base = [...messages, { role: 'user', content: text }];
    const idx = base.length;
    setMessages([...base, { role: 'assistant', content: '', streaming: true }]);
    setStreaming(true); stopRef.current = false;
    const ctrl = new AbortController(); abortRef.current = ctrl;
    try {
      await api.sendChat({ cfg, messages: base, signal: ctrl.signal, onToken: (full) => patchMsg(idx, (m) => ({ ...m, content: full })) });
      patchMsg(idx, (m) => ({ ...m, streaming: false }));
    } catch (e) {
      patchMsg(idx, (m) => ({ ...m, streaming: false, content: (m.content ? m.content + '\n\n' : '') + e.message, error: true }));
    } finally { setStreaming(false); abortRef.current = null; }
  };

  // ── agent ──
  const sendAgent = async (text) => {
    const base = [...messages, { role: 'user', content: text }];
    const idx = base.length;
    setMessages([...base, { role: 'assistant', agent: true, items: [], finalText: '', working: true }]);
    setStreaming(true); stopRef.current = false;
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const addItem = (item) => patchMsg(idx, (m) => ({ ...m, items: [...(m.items || []), item] }));
    try {
      await api.runAgentTask({ cfg, task: text, signal: ctrl.signal, onEvent: (ev) => {
        if (ev.type === 'thinking') addItem({ step: { kind: 'thinking', text: ev.text } });
        else if (ev.type === 'tool') addItem({ step: { kind: 'tool', name: ev.name, input: ev.input } });
        else if (ev.type === 'tool_result') addItem({ step: { kind: 'res', text: ev.preview } });
        else if (ev.type === 'approval') addItem({ ap: { id: ev.id, name: ev.name, preview: ev.preview || {}, decided: false, approved: null } });
        else if (ev.type === 'approval_result') patchMsg(idx, (m) => ({ ...m, items: (m.items || []).map((it) => it.ap && it.ap.id === ev.id ? { ...it, ap: { ...it.ap, decided: true, approved: ev.approved } } : it) }));
        else if (ev.type === 'artifact') addItem({ artifact: { path: ev.path, content: ev.content, bytes: ev.bytes, truncated: ev.truncated } });
        else if (ev.type === 'final') patchMsg(idx, (m) => ({ ...m, finalText: ev.text || '' }));
        else if (ev.type === 'error') addItem({ step: { kind: 'err', text: ev.message } });
      } });
    } catch (e) {
      addItem({ step: { kind: 'err', text: e.message } });
    } finally { patchMsg(idx, (m) => ({ ...m, working: false })); setStreaming(false); abortRef.current = null; }
  };

  const submit = () => {
    const text = input.trim(); if (!text || streaming) return;
    if (cfg.agentMode) {
      if (cfg.conn !== 'backend' || !cfg.backendUrl || !cfg.backendToken) { showToast('Set backend URL + token first', true); setSheet('settings'); return; }
    } else if (cfg.conn === 'backend') {
      if (!cfg.backendUrl || !cfg.backendToken) { showToast('Set backend URL + token first', true); setSheet('settings'); return; }
    } else if (!cfg.key) { showToast('Set your API key first', true); setSheet('settings'); return; }
    setInput('');
    if (cfg.agentMode) sendAgent(text); else sendChat(text);
  };

  const stop = () => { stopRef.current = true; try { abortRef.current?.abort(); } catch {} };

  const onApprove = (id, approve) => {
    setMessages((m) => m.map((msg) => msg.agent ? { ...msg, items: (msg.items || []).map((it) => it.ap && it.ap.id === id && !it.ap.decided ? { ...it, ap: { ...it.ap, decided: true, approved: approve } } : it) } : msg));
    api.approveAgent(cfg, id, approve);
  };

  const setMode = (agent) => {
    if (agent && cfg.conn !== 'backend') { showToast('Agent mode needs the VPS backend', true); setSheet('settings'); return; }
    updateCfg({ agentMode: agent });
  };

  // ── files ──
  const openFiles = async () => {
    if (cfg.conn !== 'backend') { showToast('File explorer needs the VPS backend', true); return; }
    setFiles({ tree: [], loading: true, error: '', viewing: null }); setSheet('files');
    try { const tree = await api.fetchFiles(cfg); setFiles((f) => ({ ...f, tree, loading: false })); }
    catch (e) { setFiles((f) => ({ ...f, loading: false, error: 'Could not load files (' + e.message + ')' })); }
  };
  const openFile = async (path) => {
    setFiles((f) => ({ ...f, viewing: { name: path.split('/').pop(), path, content: 'loading…' } }));
    try { const content = await api.readFile(cfg, path); setFiles((f) => ({ ...f, viewing: { name: path.split('/').pop(), path, content } })); }
    catch (e) { setFiles((f) => ({ ...f, viewing: { name: path.split('/').pop(), path, content: 'Could not read: ' + e.message } })); }
  };
  const askAboutFile = (path) => {
    setSheet(null);
    if (!cfg.agentMode) updateCfg({ agentMode: true });
    setInput('Look at ' + path + ' and explain what it does.');
  };

  const copyMsg = (msg) => { try { navigator.clipboard.writeText(msg.content || msg.finalText || ''); showToast('Copied ✓'); } catch {} };

  // Upload a file from the phone into the VPS workspace.
  const onUpload = async (file) => {
    if (cfg.conn !== 'backend') { showToast('Upload needs the VPS backend', true); return; }
    if (file.size > 8 * 1024 * 1024) { showToast('File too large (max 8 MB)', true); return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      await api.uploadFile(cfg, file.name, btoa(bin), 'base64');
      showToast('Uploaded ' + file.name + ' ✓');
      setMessages((m) => [...m, { role: 'user', content: '', upload: { name: file.name, size: file.size } }]);
    } catch (e) { showToast('Upload failed: ' + e.message, true); }
  };
  const providerName = providers.find((p) => p.id === cfg.providerId)?.name;

  return (
    <>
      <Header
        cfg={cfg} dotState={dot} providerName={providerName}
        onMenu={() => setSheet('sidebar')} onFiles={openFiles} onNewChat={newChat}
        onToggleTheme={() => { const t = theme === 'light' ? 'dark' : 'light'; setTheme(t); saveTheme(t); }}
        onSettings={() => setSheet('settings')} onModelPick={() => setSheet('picker')}
      />
      <main id="main" ref={mainRef}>
        <div className="thread">
          {messages.length === 0 ? (
            <Empty agentMode={cfg.agentMode} onChip={(t) => setInput(t)} />
          ) : (
            messages.map((m, i) => <Message key={i} msg={m} cfg={cfg} onApprove={onApprove} onCopy={copyMsg} />)
          )}
        </div>
      </main>
      <Composer cfg={cfg} streaming={streaming} value={input} setValue={setInput} onSubmit={submit} onStop={stop} onSetMode={setMode} onUpload={onUpload} />

      <Sidebar open={sheet === 'sidebar'} sessions={sessions} activeId={activeId} onSwitch={switchChat} onNew={newChat} onDelete={deleteChat} onClose={() => setSheet(null)} />
      <Settings open={sheet === 'settings'} cfg={cfg} providers={providers} onSave={(nc) => { setCfg(nc); saveCfg(nc); }} onClose={() => setSheet(null)} onRefreshProviders={() => api.fetchProviders(cfg).then(setProviders)} />
      <FileExplorer open={sheet === 'files'} tree={files.tree} loading={files.loading} error={files.error} viewing={files.viewing}
        onClose={() => setSheet(null)} onRefresh={openFiles} onOpenFile={openFile} onBack={() => setFiles((f) => ({ ...f, viewing: null }))} onAsk={askAboutFile} />
      <ModelPicker open={sheet === 'picker'} cfg={cfg} onPick={(m) => { updateCfg({ model: m.id, modelLabel: m.label }); setSheet(null); }} onClose={() => setSheet(null)} />
      <Toast toast={toast} />
    </>
  );
}
