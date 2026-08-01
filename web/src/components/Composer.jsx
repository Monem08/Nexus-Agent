import { useRef, useEffect } from 'react';

export default function Composer({ cfg, streaming, value, setValue, onSubmit, onStop, onSetMode }) {
  const ref = useRef(null);
  useEffect(() => {
    const t = ref.current;
    if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }
  }, [value]);

  const agent = !!cfg.agentMode;
  const key = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) onSubmit();
    }
  };
  return (
    <footer>
      <div className="composer">
        <div className="mode-row">
          <div className="agent-seg">
            <button type="button" className={!agent ? 'on' : ''} onClick={() => onSetMode(false)}>💬 Chat</button>
            <button type="button" className={agent ? 'on' : ''} onClick={() => onSetMode(true)}>🤖 Agent</button>
          </div>
          <span className="mode-note">{agent ? 'uses tools on your VPS' : ''}</span>
        </div>
        <div className="input-row">
          <textarea
            ref={ref}
            rows={1}
            placeholder={agent ? 'Give the agent a task…' : 'Message the model…'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={key}
            autoComplete="off"
          />
          <button
            className={'send' + (streaming ? ' stop' : '')}
            disabled={!streaming && !value.trim()}
            onClick={() => (streaming ? onStop() : onSubmit())}
            title={streaming ? 'Stop' : 'Send'}
          >
            {streaming ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            )}
          </button>
        </div>
        <div className="foot-hint">Enter to send · Shift+Enter newline · key stays in <b>this browser only</b></div>
      </div>
    </footer>
  );
}
