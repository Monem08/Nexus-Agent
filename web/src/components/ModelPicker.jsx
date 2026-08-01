import { useState } from 'react';

const FALLBACK_MODELS = [
  { g: 'Anthropic · Claude', items: [
    { id: 'claude-opus-5', label: 'Claude Opus 5', tag: 'newest · top' },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', tag: 'reasoning' },
  ] },
  { g: 'OpenAI · GPT', items: [
    { id: 'gpt-5.6-sol', label: 'GPT 5.6 Sol', tag: 'flagship' },
  ] },
];

export default function ModelPicker({ open, cfg, onPick, onClose }) {
  const [q, setQ] = useState('');
  const f = q.toLowerCase();
  return (
    <>
      <div className={'overlay' + (open ? ' open' : '')} onClick={onClose} />
      <div className={'sheet' + (open ? ' open' : '')} id="picker">
        <div className="sheet-head"><h2>select model</h2><button className="x" onClick={onClose}>×</button></div>
        <div className="search-box"><input type="text" placeholder="filter models…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="model-list">
          {FALLBACK_MODELS.map((grp) => {
            const items = grp.items.filter((m) => (m.label || m.id).toLowerCase().includes(f) || m.id.toLowerCase().includes(f));
            if (!items.length) return null;
            return (
              <div key={grp.g}>
                <div className="grp-label">{grp.g}</div>
                {items.map((m) => (
                  <div className={'model-item' + (m.id === cfg.model ? ' active' : '')} key={m.id} onClick={() => onPick(m)}>
                    <span className="mname">{m.label || m.id}</span>
                    {m.tag && <span className="mmeta">{m.tag}</span>}
                    <span className="check">✓</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
