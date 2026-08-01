import { useState } from 'react';
import { md } from '../lib/md.js';
import Icon from './Icon.jsx';

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

// A file the agent created — shown in chat with copy + download.
function FileCard({ art }) {
  const [copied, setCopied] = useState(false);
  const canGrab = typeof art.content === 'string' && art.content.length > 0;
  const name = (art.path || 'file').split('/').pop();
  const copy = () => {
    if (!canGrab) return;
    try { navigator.clipboard.writeText(art.content); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };
  const download = () => {
    if (!canGrab) return;
    const blob = new Blob([art.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="file-card">
      <span className="fc-ic"><Icon name="fileText" size={20} /></span>
      <div className="fc-meta">
        <div className="fc-name">{art.path}</div>
        <div className="fc-sz">{fmtSize(art.bytes)}{art.truncated ? ' · too large to copy here — open in Files' : ''}</div>
      </div>
      {canGrab && (
        <div className="fc-actions">
          <button className="fc-btn" onClick={copy} title="Copy contents">{copied ? <Icon name="check" size={15} /> : <Icon name="copy" size={15} />}</button>
          <button className="fc-btn" onClick={download} title="Download">
            <Icon name="download" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

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
  const icon = ap.name === 'run_command' ? 'bolt' : 'pencil';
  const title = pv.kind === 'command' ? 'Run command' : pv.title || ap.name;
  return (
    <div className="ap-card">
      <div className="ap-title"><Icon name={icon} size={14} /> {title}</div>
      <div className="ap-body">{body}</div>
      {!ap.decided ? (
        <div className="ap-btns">
          <button className="ap-btn ok" onClick={() => onApprove(ap.id, true)}><Icon name="check" size={15} /> Approve</button>
          <button className="ap-btn no" onClick={() => onApprove(ap.id, false)}><Icon name="x" size={15} /> Reject</button>
        </div>
      ) : (
        <div className={'ap-status ' + (ap.approved ? 'ok' : 'no')}>
          {ap.approved ? <><Icon name="check" size={13} /> Approved</> : <><Icon name="x" size={13} /> Rejected</>}
        </div>
      )}
    </div>
  );
}

function Step({ s }) {
  if (s.kind === 'thinking') return <div className="agent-step"><Icon name="think" size={13} /> {s.text}</div>;
  if (s.kind === 'tool') return <div className="agent-step tool"><Icon name="wrench" size={13} /> {s.name} {JSON.stringify(s.input || {})}</div>;
  if (s.kind === 'res') return <div className="agent-step res"><Icon name="cornerArrow" size={13} /> {String(s.text || '').replace(/\s+/g, ' ').slice(0, 220)}</div>;
  if (s.kind === 'err') return <div className="agent-step err"><Icon name="x" size={13} /> {s.text}</div>;
  return null;
}

export default function AgentActivity({ items, finalText, working, onApprove }) {
  const hasSteps = items.some((it) => it.step);
  return (
    <div className="content">
      {items.length > 0 && (
        <div className="agent-steps">
          {hasSteps && <div className="ah"><Icon name="diamond" size={9} /> agent activity</div>}
          {items.map((it, i) =>
            it.ap ? <ApprovalCard ap={it.ap} onApprove={onApprove} key={it.ap.id} />
              : it.artifact ? <FileCard art={it.artifact} key={i} />
                : <Step s={it.step} key={i} />,
          )}
        </div>
      )}
      {finalText ? (
        <div dangerouslySetInnerHTML={{ __html: md(finalText) }} />
      ) : working ? (
        <div style={{ marginTop: items.length ? 6 : 0 }}>
          <span className="working"><Icon name="robot" size={14} /> working<span className="dots"><i /><i /><i /></span></span>
        </div>
      ) : items.length === 0 ? (
        <span className="agent-step res">(no response)</span>
      ) : null}
    </div>
  );
}
