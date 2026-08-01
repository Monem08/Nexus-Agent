import { useState, useEffect } from 'react';

export default function Settings({ open, cfg, providers, onSave, onClose, onRefreshProviders }) {
  const [d, setD] = useState(cfg);
  useEffect(() => { if (open) setD(cfg); }, [open, cfg]);
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const backend = d.conn === 'backend';

  const pickProvider = (id) => {
    const p = providers.find((x) => x.id === id);
    const patch = { providerId: id };
    if (p && p.model) { patch.model = p.model; patch.modelLabel = p.name; }
    set(patch);
  };

  const statusOk = backend ? (d.backendUrl && d.backendToken) : !!d.key;
  const statusTxt = backend
    ? (statusOk ? 'VPS backend · ready' : 'Backend URL + token needed')
    : (d.key ? 'API key set · ready' : 'No API key set');

  return (
    <>
      <div className={'overlay' + (open ? ' open' : '')} onClick={onClose} />
      <aside className={'sheet' + (open ? ' open' : '')} id="settings">
        <div className="sheet-head"><h2>settings</h2><button className="x" onClick={onClose}>×</button></div>
        <div className="sheet-body">
          <div className="status-line">
            <span className={'sdot ' + (statusOk ? 'ok' : 'bad')} />
            <span>{statusTxt}</span>
          </div>

          <div className="field">
            <label>Route</label>
            <div className="seg">
              <button className={!backend ? 'on' : ''} onClick={() => set({ conn: 'direct' })}>Direct API</button>
              <button className={backend ? 'on' : ''} onClick={() => set({ conn: 'backend' })}>VPS&nbsp;Backend</button>
            </div>
            <div className="hint"><b>Direct</b> — browser calls the gateway. <b>VPS Backend</b> — routes through your Nexus server (needed for Agent mode).</div>
          </div>

          {backend && (
            <>
              <div className="field">
                <label>Backend URL &amp; Token</label>
                <input type="text" placeholder="https://agent.yourdomain.com" style={{ marginBottom: 8 }} value={d.backendUrl} onChange={(e) => set({ backendUrl: e.target.value })} />
                <input type="password" placeholder="AGENT_TOKEN (bearer)" value={d.backendToken} onChange={(e) => set({ backendToken: e.target.value })} />
              </div>
              <div className="field">
                <label>AI Provider</label>
                <div className="key-row">
                  <select id="providerSel" style={{ flex: 1 }} value={d.providerId} onChange={(e) => pickProvider(e.target.value)}>
                    {providers.length === 0 && <option value="">(server default)</option>}
                    {providers.map((p) => (
                      <option value={p.id} key={p.id}>{p.name}{p.model ? ' · ' + p.model : ''}{p.supportsTools ? '' : ' (chat only)'}</option>
                    ))}
                  </select>
                  <button className="ghost-btn" onClick={onRefreshProviders} title="Reload">↻</button>
                </div>
                <div className="hint">Add more in <code>server/providers.json</code>.</div>
              </div>
              <div className="field">
                <label className="row-label"><input type="checkbox" checked={!!d.autoApprove} onChange={(e) => set({ autoApprove: e.target.checked })} /> Auto-approve agent actions</label>
                <div className="hint">Off (recommended): the agent asks before writing files or running commands.</div>
              </div>
            </>
          )}

          {!backend && (
            <>
              <div className="field">
                <label>API Key</label>
                <input type="password" placeholder="sk-..." value={d.key} onChange={(e) => set({ key: e.target.value })} />
              </div>
              <div className="field">
                <label>Base URL</label>
                <input type="text" placeholder="https://agentrouter.org/v1" value={d.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} />
              </div>
              <div className="field">
                <label>Transport</label>
                <div className="seg">
                  {['auto', 'anthropic', 'openai'].map((m) => (
                    <button key={m} className={d.mode === m ? 'on' : ''} onClick={() => set({ mode: m })}>{m === 'anthropic' ? 'Claude Code' : m === 'openai' ? 'OpenAI' : 'Auto'}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>CORS Proxy <span style={{ color: 'var(--txt-faint)', textTransform: 'none' }}>(optional)</span></label>
                <input type="text" placeholder="https://your-worker.workers.dev/" value={d.proxy} onChange={(e) => set({ proxy: e.target.value })} />
              </div>
            </>
          )}

          <div className="field">
            <label>System Prompt</label>
            <input type="text" placeholder="You are a helpful assistant." value={d.sys} onChange={(e) => set({ sys: e.target.value })} />
          </div>
          <div className="field slider-field">
            <label>Temperature <span className="val">{d.temp}</span></label>
            <input type="range" min="0" max="2" step="0.1" value={d.temp} onChange={(e) => set({ temp: parseFloat(e.target.value) })} />
          </div>
          <div className="field slider-field">
            <label>Max Tokens <span className="val">{d.maxTok}</span></label>
            <input type="range" min="256" max="8192" step="256" value={d.maxTok} onChange={(e) => set({ maxTok: parseInt(e.target.value) })} />
          </div>

          <button className="save-btn" onClick={() => { onSave(d); onClose(); }}>Save settings</button>
        </div>
      </aside>
    </>
  );
}
