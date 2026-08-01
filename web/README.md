# Nexus Web (Vite + React)

The Nexus frontend, rewritten as a React app for easier UI development. It
builds to `../server/webdist`, which the Express backend serves — so
**deploying stays build-free**: the built output is committed, and the VPS
just needs `git pull` + `pm2 restart`.

## Develop

```bash
cd web
npm install
npm run dev          # hot-reload dev server (talks to your backend via the UI settings)
```

## Build (regenerates what the backend serves)

```bash
npm run build        # outputs to ../server/webdist  (commit this)
```

After a build, commit both your `web/src` changes **and** the regenerated
`server/webdist/` so the backend serves the new UI.

## Structure

- `src/App.jsx` — top-level state (config, sessions, streaming, sheets).
- `src/lib/` — `api.js` (backend + direct-mode chat/agent streaming, files,
  providers, health), `store.js` (localStorage config/sessions), `md.js`
  (markdown renderer).
- `src/components/` — Header, Empty, Message, Composer, AgentActivity
  (steps + approval cards), Settings, Sidebar, FileExplorer, ModelPicker,
  Toast.
- `src/styles.css` — ported from the original single-file app (same design
  tokens and classes, so the look is unchanged).

The original single-file UI is kept at `../nexus-agentrouter-chat-4.html`
and remains reachable at `/legacy` on the backend as a fallback.
