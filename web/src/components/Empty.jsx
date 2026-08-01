import Icon from './Icon.jsx';

const CHAT_CHIPS = [
  ['bulb', 'Explain forex risk management simply'],
  ['code', 'Write a Python proxy checker bot'],
  ['tools', 'Debug my Kotlin CI pipeline'],
  ['mic', 'Roast my code like a football commentator'],
];
const AGENT_CHIPS = [
  ['folderOpen', 'List the files in my project'],
  ['file', 'Read my README and summarise it'],
  ['pencil', 'Create notes.txt with a short to-do list'],
  ['bolt', 'Run: node --version'],
];

export default function Empty({ agentMode, onChip }) {
  const chips = agentMode ? AGENT_CHIPS : CHAT_CHIPS;
  return (
    <div className="empty">
      <div className="glyph"><Icon name={agentMode ? 'robot' : 'brain'} size={34} strokeWidth={1.7} style={{ color: 'var(--cyan)' }} /></div>
      <h1>nexus<span>://</span>ready</h1>
      <p>
        {agentMode
          ? "Give me a task and I'll use tools on your VPS to do it — you approve every change."
          : 'Chat with any model. Flip to Agent to have me work on your project.'}
      </p>
      <div className="chips">
        {chips.map(([ic, t]) => (
          <div className="chip" key={t} onClick={() => onChip(t)}>
            <span className="ci"><Icon name={ic} size={17} /></span>{t}
          </div>
        ))}
      </div>
    </div>
  );
}
