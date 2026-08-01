export default function Sidebar({ open, sessions, activeId, onSwitch, onNew, onDelete, onClose }) {
  return (
    <>
      <div className={'overlay' + (open ? ' open' : '')} onClick={onClose} />
      <aside className={'sheet' + (open ? ' open' : '')} id="sidebar">
        <div className="sheet-head">
          <h2>chats</h2>
          <button className="ghost-btn" style={{ marginLeft: 'auto', padding: '7px 12px' }} onClick={onNew}>+ New</button>
          <button className="x" style={{ marginLeft: 8 }} onClick={onClose}>×</button>
        </div>
        <div className="sess-list">
          {sessions.length === 0 && <div style={{ padding: 16, color: 'var(--txt-faint)', fontSize: 13 }}>No chats yet.</div>}
          {sessions.map((s) => (
            <div className={'sess-item' + (s.id === activeId ? ' active' : '')} key={s.id} onClick={() => onSwitch(s.id)}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'New chat'}</span>
              <button className="x" style={{ fontSize: 16 }} onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}>×</button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
