import { md } from '../lib/md.js';

function ApprovalCard({ ap, onApprove }) {
  const pv = ap.preview || {};
  let body;
  if (pv.kind === 'command') {
    body = <div className="d ctx">$ {pv.title || ''}</div>;
  } else if (pv.kind === 'diff') {
    body = (pv.body || '').split('\n').map((l, i) => {
      const cls = l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : 'ctx';
      return <div className={'d ' + cls} key={i}>{l}</div>;
    });
  } else {
    body = <div className="d ctx">{pv.body || ''}</div>;
  }
  const icon = ap.name === 'run_command' ? '⚡' : '✏️';
  const title = pv.kind === 'command' ? 'Run command' : pv.title || ap.name;
  return (
    <div className="ap-card">
      <div className="ap-title">{icon} {title}</div>
      <div className="ap-body">{body}</div>
      {!ap.decided ? (
        <div className="ap-btns">
          <button className="ap-btn ok" onClick={() => onApprove(ap.id, true)}>✅ Approve</button>
          <button className="ap-btn no" onClick={() => onApprove(ap.id, false)}>❌ Reject</button>
        </div>
      ) : (
        <div className={'ap-status ' + (ap.approved ? 'ok' : 'no')}>{ap.approved ? '✅ Approved' : '❌ Rejected'}</div>
      )}
    </div>
  );
}

function Step({ s }) {
  if (s.kind === 'thinking') return <div className="agent-step">💭 {s.text}</div>;
  if (s.kind === 'tool') return <div className="agent-step tool">🔧 {s.name} {JSON.stringify(s.input || {})}</div>;
  if (s.kind === 'res') return <div className="agent-step res">↳ {String(s.text || '').replace(/\s+/g, ' ').slice(0, 220)}</div>;
  if (s.kind === 'err') return <div className="agent-step err">❌ {s.text}</div>;
  return null;
}

export default function AgentActivity({ items, finalText, working, onApprove }) {
  const hasSteps = items.some((it) => it.step);
  return (
    <div className="content">
      {items.length > 0 && (
        <div className="agent-steps">
          {hasSteps && <div className="ah">◆ agent activity</div>}
          {items.map((it, i) =>
            it.ap ? <ApprovalCard ap={it.ap} onApprove={onApprove} key={it.ap.id} /> : <Step s={it.step} key={i} />,
          )}
        </div>
      )}
      {finalText ? (
        <div dangerouslySetInnerHTML={{ __html: md(finalText) }} />
      ) : working ? (
        <div style={{ marginTop: items.length ? 6 : 0 }}>
          <span className="working">🤖 working<span className="dots"><i /><i /><i /></span></span>
        </div>
      ) : items.length === 0 ? (
        <span className="agent-step res">(no response)</span>
      ) : null}
    </div>
  );
}
