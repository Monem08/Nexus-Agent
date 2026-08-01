const dotColor = { ok: 'var(--cyan)', bad: 'var(--red)', idle: 'var(--txt-faint)' };

export default function Header({ cfg, dotState, providerName, onMenu, onFiles, onNewChat, onToggleTheme, onSettings, onModelPick }) {
  const c = dotColor[dotState] || dotColor.idle;
  const sub = cfg.conn === 'backend' ? (providerName || 'vps') : 'agentrouter';
  return (
    <header>
      <button className="icon-btn" id="menuBtn" title="Chats" style={{ marginRight: 2 }} onClick={onMenu}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
      </button>
      <div className="brand">
        <span className="dot" style={{ background: c, boxShadow: `0 0 12px ${c}` }} title={dotState === 'ok' ? 'VPS online' : dotState === 'bad' ? 'VPS unreachable' : 'not connected'} />
        Nexus <small>· {sub.toLowerCase()}</small>
      </div>
      <div className="model-pill" title="Switch model" onClick={onModelPick}>
        <b>{cfg.modelLabel || cfg.model || 'no model'}</b>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {cfg.conn === 'backend' && (
        <button className="icon-btn" title="Files" onClick={onFiles}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
        </button>
      )}
      <button className="icon-btn" title="New chat" onClick={onNewChat}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <button className="icon-btn" title="Theme" onClick={onToggleTheme}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
      </button>
      <button className="icon-btn" title="Settings" onClick={onSettings}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      </button>
    </header>
  );
}
