// ── SVG icon catalog ─────────────────────────────────────────
// Replacements for every emoji currently used in the UI. Line-style,
// 24×24, stroke = currentColor so they inherit the surrounding text color.
//
// NOTHING is wired up yet — this is just the catalog. The later step swaps
// each emoji for <Icon name="…" />. EMOJI_MAP below records which emoji maps
// to which icon (and where it's used) so the replacement is mechanical.
//
// Usage (later): <Icon name="robot" /> or <Icon name="bolt" size={14} />

const P = {
  // 🤖 robot
  robot: <><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /><path d="M9.5 17h5" /></>,
  // ❌ reject / cross
  x: <path d="M18 6 6 18M6 6l12 12" />,
  // ✅ check / approve
  check: <path d="M20 6 9 17l-5-5" />,
  // ⚡ bolt / run command
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  // 🔧 wrench / tool
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.2-.4-.4-2.2z" />,
  // 🐍 code (used for .js/.py file glyph)
  code: <path d="M8 6 3 12l5 6M16 6l5 6-5 6" />,
  // 📂 folder-open
  folderOpen: <><path d="M4 19a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1" /><path d="M2 12h19l-2.2 6.3a1 1 0 0 1-1 .7H4a2 2 0 0 1-2-2z" /></>,
  // 📁 folder
  folder: <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2z" />,
  // 📄 / 📝 file
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
  // 📜 file with text lines (code file)
  fileText: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" /></>,
  // ⚠️ warning
  warning: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.5v.5" /></>,
  // ✏️ / ✍️ pencil / edit
  pencil: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  // 💭 thought bubble
  think: <><path d="M8.5 14a3.5 3.5 0 1 1 2.6-5.8A3.5 3.5 0 1 1 15.5 14z" /><circle cx="7" cy="18" r="1.3" /><circle cx="4.5" cy="20.5" r="0.8" /></>,
  // 💬 chat bubble
  chat: <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />,
  // 💡 lightbulb
  bulb: <path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z" />,
  // 🛠️ tools
  tools: <path d="M14.5 6.5 18 3l3 3-3.5 3.5-2-.5-.5-2.5zM4 18l7-7 2 2-7 7-2.5.5.5-2.5z" />,
  // 🎙️ microphone
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7" /></>,
  // 🧠 brain
  brain: <path d="M9.5 5A3 3 0 0 0 6.5 8a3 3 0 0 0-1 5.5A3 3 0 0 0 9.5 19M14.5 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5.5A3 3 0 0 1 14.5 19M12 5v14" />,
  // 🌐 globe
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" /></>,
  // 🎨 palette
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-1 1-1.8-.4-.8 0-1.7 1-1.7h2A4 4 0 0 0 21 13a9 9 0 0 0-9-10z" /><circle cx="8" cy="10" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16" cy="10" r="1" /></>,
  // 🖼️ image
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="m4 19 5-5 3 3 3-3 5 5" /></>,
  // ⚙️ gear / settings
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,

  // bonus non-emoji glyphs used in the UI (↻ ↳ ◆) — handy for the same pass
  refresh: <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />,
  cornerArrow: <path d="M9 5v6a2 2 0 0 0 2 2h8M15 9l4 4-4 4" />,
  diamond: <path d="M12 3 21 12 12 21 3 12z" />,

  // file upload / download / copy
  paperclip: <path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.48-8.49" />,
  upload: <><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M12 15V3M8 7l4-4 4 4" /></>,
  download: <><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M12 3v12M8 11l4 4 4-4" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></>,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />,
};

export const ICON_NAMES = Object.keys(P);

// emoji → icon name, with where each emoji appears today (for the swap step).
export const EMOJI_MAP = {
  '🤖': { name: 'robot', where: 'AgentActivity, Composer, Empty, FileExplorer' },
  '❌': { name: 'x', where: 'AgentActivity (reject / error)' },
  '✅': { name: 'check', where: 'AgentActivity (approve)' },
  '⚡': { name: 'bolt', where: 'AgentActivity (run title), Empty (chip)' },
  '🔧': { name: 'wrench', where: 'AgentActivity (tool step), FileExplorer (.json)' },
  '🐍': { name: 'code', where: 'Empty (chip), FileExplorer (.py)' },
  '📂': { name: 'folderOpen', where: 'Empty (chip), FileExplorer (open dir)' },
  '📁': { name: 'folder', where: 'FileExplorer (closed dir)' },
  '📄': { name: 'file', where: 'Empty (chip), FileExplorer (default file)' },
  '📜': { name: 'fileText', where: 'FileExplorer (.js/.ts)' },
  '📝': { name: 'file', where: 'FileExplorer (.md/.txt)' },
  '⚠️': { name: 'warning', where: 'App (chat error)' },
  '✏️': { name: 'pencil', where: 'AgentActivity (write approval)' },
  '✍️': { name: 'pencil', where: 'Empty (chip)' },
  '💭': { name: 'think', where: 'AgentActivity (thinking step)' },
  '💬': { name: 'chat', where: 'Composer (Chat tab)' },
  '💡': { name: 'bulb', where: 'Empty (chip)' },
  '🛠️': { name: 'tools', where: 'Empty (chip)' },
  '🎙️': { name: 'mic', where: 'Empty (chip)' },
  '🧠': { name: 'brain', where: 'Empty (chat glyph)' },
  '🌐': { name: 'globe', where: 'FileExplorer (.html)' },
  '🎨': { name: 'palette', where: 'FileExplorer (.css)' },
  '🖼️': { name: 'image', where: 'FileExplorer (images)' },
  '⚙️': { name: 'gear', where: 'FileExplorer (.sh)' },
};

export default function Icon({ name, size = 16, strokeWidth = 2, style, className, title }) {
  const body = P[name];
  if (!body) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, verticalAlign: 'middle', ...style }}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}
