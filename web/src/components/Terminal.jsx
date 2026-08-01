import { useState, useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import * as api from '../lib/api.js';

// A live terminal. Commands run in the workspace via /exec; output streams
// in over the WS /stream feed (so the agent's own commands appear here too).
export default function Terminal({ open, cfg, onClose }) {
  const [lines, setLines] = useState([]);
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState([]);
  const wsRef = useRef(null);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const push = (l) => setLines((x) => [...x, l]);

  useEffect(() => {
    if (!open || cfg.conn !== 'backend' || !cfg.backendToken) return;
    setLines([{ type: 'sys', text: "Nexus terminal · commands run in your workspace. Dangerous commands are blocked." }]);
    const ws = api.openStream(cfg, (ev) => {
      if (ev.type === 'exec:start') push({ type: 'cmd', text: ev.cmd });
      else if (ev.type === 'exec:output') push({ type: ev.stream === 'err' ? 'err' : 'out', text: ev.chunk });
      else if (ev.type === 'exec:done') push({ type: 'exit', code: ev.code, timedOut: ev.timedOut });
    });
    if (ws) {
      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
      ws.onerror = () => setConnected(false);
    }
    wsRef.current = ws;
    setTimeout(() => inputRef.current?.focus(), 200);
    return () => { try { ws?.close(); } catch {} wsRef.current = null; };
  }, [open, cfg.conn, cfg.backendUrl, cfg.backendToken]);

  useEffect(() => { const b = bodyRef.current; if (b) b.scrollTop = b.scrollHeight; }, [lines]);

  const run = async () => {
    const c = cmd.trim();
    if (!c || busy) return;
    setCmd(''); setHistory((h) => [...h, c]); setBusy(true);
    const live = wsRef.current && wsRef.current.readyState === 1;
    if (!live) push({ type: 'cmd', text: c });
    try {
      const r = await api.runExec(cfg, c);
      if (!live) {
        if (r.stdout) push({ type: 'out', text: r.stdout });
        if (r.stderr) push({ type: 'err', text: r.stderr });
        push({ type: 'exit', code: r.code, timedOut: r.timedOut });
      }
    } catch (e) {
      push({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'ArrowUp' && history.length) { e.preventDefault(); setCmd(history[history.length - 1]); }
  };

  return (
    <>
      <div className={'overlay' + (open ? ' open' : '')} onClick={onClose} />
      <aside className={'sheet' + (open ? ' open' : '')} id="terminal">
        <div className="sheet-head">
          <h2><Icon name="terminal" size={15} /> terminal</h2>
          <span className={'term-dot ' + (connected ? 'on' : '')} title={connected ? 'live' : 'offline'} />
          <button className="ghost-btn" style={{ marginLeft: 'auto', padding: '7px 10px' }} onClick={() => setLines((l) => l.slice(0, 1))} title="Clear">clear</button>
          <button className="x" style={{ marginLeft: 8 }} onClick={onClose}>×</button>
        </div>
        <div className="term-body" ref={bodyRef} onClick={() => inputRef.current?.focus()}>
          {lines.map((l, i) => {
            if (l.type === 'cmd') return <div className="term-line cmd" key={i}><span className="tp">$</span> {l.text}</div>;
            if (l.type === 'exit') return <div className="term-line exit" key={i}>[exit {l.code ?? 'killed'}{l.timedOut ? ' · timed out' : ''}]</div>;
            return <div className={'term-line ' + l.type} key={i}>{l.text}</div>;
          })}
        </div>
        <div className="term-input">
          <span className="tp">$</span>
          <input ref={inputRef} value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={onKey}
            placeholder={busy ? 'running…' : 'type a command…'} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <button className="term-run" onClick={run} disabled={busy || !cmd.trim()}><Icon name="send" size={16} /></button>
        </div>
      </aside>
    </>
  );
}
