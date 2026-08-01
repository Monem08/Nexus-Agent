const CHAT_CHIPS = [
  ['💡', 'Explain forex risk management simply'],
  ['🐍', 'Write a Python proxy checker bot'],
  ['🛠️', 'Debug my Kotlin CI pipeline'],
  ['🎙️', 'Roast my code like a football commentator'],
];
const AGENT_CHIPS = [
  ['📂', 'List the files in my project'],
  ['📄', 'Read my README and summarise it'],
  ['✍️', 'Create notes.txt with a short to-do list'],
  ['⚡', 'Run: node --version'],
];

export default function Empty({ agentMode, onChip }) {
  const chips = agentMode ? AGENT_CHIPS : CHAT_CHIPS;
  return (
    <div className="empty">
      <div className="glyph">{agentMode ? '🤖' : '🧠'}</div>
      <h1>nexus<span>://</span>ready</h1>
      <p>
        {agentMode
          ? "Give me a task and I'll use tools on your VPS to do it — you approve every change."
          : 'Chat with any model. Flip to Agent to have me work on your project.'}
      </p>
      <div className="chips">
        {chips.map(([ic, t]) => (
          <div className="chip" key={t} onClick={() => onChip(t)}>
            <span className="ci">{ic}</span>{t}
          </div>
        ))}
      </div>
    </div>
  );
}
