import { md } from '../lib/md.js';
import AgentActivity from './AgentActivity.jsx';
import Icon from './Icon.jsx';

export default function Message({ msg, cfg, onApprove, onCopy, onRegen }) {
  const isUser = msg.role === 'user';
  const onContentClick = (e) => {
    const cc = e.target.closest('.copy-code');
    if (cc) {
      try { navigator.clipboard.writeText(decodeURIComponent(cc.dataset.code)); cc.textContent = 'copied'; setTimeout(() => (cc.textContent = 'copy'), 1200); } catch {}
    }
  };
  return (
    <div className={'msg ' + (isUser ? 'user' : 'bot')}>
      <div className="av">{isUser ? 'YOU' : 'AI'}</div>
      <div className="bubble">
        <div className="who">{isUser ? 'you' : <span className="mtag">{cfg.modelLabel || cfg.model}</span>}</div>
        {msg.images && msg.images.length > 0 && (
          <div className="msg-imgs">
            {msg.images.map((im, i) => <img key={i} src={im.url || `data:${im.media_type};base64,${im.data}`} alt="" />)}
          </div>
        )}
        {msg.upload ? (
          <div className="content">
            <span className="upload-chip"><Icon name="paperclip" size={14} /> {msg.upload.name}<span className="uc-tag">uploaded</span></span>
          </div>
        ) : msg.agent ? (
          <AgentActivity items={msg.items || []} finalText={msg.finalText || ''} working={!!msg.working} onApprove={onApprove} />
        ) : isUser ? (
          <div className="content">{msg.content}</div>
        ) : msg.error ? (
          <div className="content" style={{ color: 'var(--red)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="warning" size={16} style={{ marginTop: 3 }} />
            <span dangerouslySetInnerHTML={{ __html: md(msg.content || '') }} />
          </div>
        ) : (
          <div className={'content' + (msg.streaming ? ' cursor-blink' : '')} onClick={onContentClick} dangerouslySetInnerHTML={{ __html: md(msg.content || '') }} />
        )}
        {!isUser && !msg.streaming && !msg.working && (
          <div className="msg-tools">
            <button onClick={() => onCopy(msg)}>copy</button>
            {onRegen && <button onClick={() => onRegen(msg)}>regenerate</button>}
          </div>
        )}
      </div>
    </div>
  );
}
