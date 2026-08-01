import { useState } from 'react';

function iconFor(name) {
  const e = (name.split('.').pop() || '').toLowerCase();
  if (['js', 'mjs', 'ts', 'jsx', 'tsx'].includes(e)) return '📜';
  if (e === 'json') return '🔧';
  if (['md', 'txt'].includes(e)) return '📝';
  if (['html', 'htm'].includes(e)) return '🌐';
  if (e === 'css') return '🎨';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(e)) return '🖼️';
  if (e === 'py') return '🐍';
  if (e === 'sh') return '⚙️';
  return '📄';
}
function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n / 1024).toFixed(0) + 'K';
  return (n / 1048576).toFixed(1) + 'M';
}

function Node({ node, depth, onOpen }) {
  const [open, setOpen] = useState(false);
  const pad = { paddingLeft: 9 + depth * 14 };
  if (node.type === 'dir') {
    return (
      <>
        <div className="ft-row" style={pad} onClick={() => setOpen(!open)}>
          <span className="tw">{open ? '▾' : '▸'}</span>
          <span className="ic">{open ? '📂' : '📁'}</span>
          <span className="nm">{node.name}</span>
        </div>
        {open && <div className="ft-children">{(node.children || []).map((c) => <Node key={c.path} node={c} depth={depth + 1} onOpen={onOpen} />)}</div>}
      </>
    );
  }
  return (
    <div className="ft-row" style={pad} onClick={() => onOpen(node.path)}>
      <span className="tw" />
      <span className="ic">{iconFor(node.name)}</span>
      <span className="nm">{node.name}</span>
      <span className="sz">{fmtSize(node.size)}</span>
    </div>
  );
}

export default function FileExplorer({ open, tree, loading, error, viewing, onClose, onRefresh, onOpenFile, onBack, onAsk }) {
  return (
    <>
      <div className={'overlay' + (open ? ' open' : '')} onClick={onClose} />
      <aside className={'sheet' + (open ? ' open' : '')} id="files">
        <div className="sheet-head">
          {viewing && <button className="ghost-btn" style={{ padding: '6px 10px' }} onClick={onBack}>‹ Back</button>}
          <h2>{viewing ? viewing.name : 'files'}</h2>
          {!viewing && <button className="ghost-btn" style={{ marginLeft: 'auto', padding: '7px 10px' }} onClick={onRefresh} title="Reload">↻</button>}
          <button className="x" style={{ marginLeft: 8 }} onClick={onClose}>×</button>
        </div>
        {viewing ? (
          <div className="file-view">
            <div className="fv-actions">
              <button className="ghost-btn" onClick={() => onAsk(viewing.path)}>🤖 Ask agent about this</button>
            </div>
            <pre className="fv-pre">{viewing.content}</pre>
          </div>
        ) : (
          <div className="file-tree">
            {loading && <div className="empty-note">loading…</div>}
            {error && <div className="empty-note">{error}</div>}
            {!loading && !error && tree.length === 0 && <div className="empty-note">Your project folder is empty.<br />Ask the agent to create something!</div>}
            {!loading && !error && tree.map((n) => <Node key={n.path} node={n} depth={0} onOpen={onOpenFile} />)}
          </div>
        )}
      </aside>
    </>
  );
}
