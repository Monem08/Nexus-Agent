# Nexus Agent — Backend (Phase 0)

The VPS "hands" for the Nexus agent. A Node.js + Express + `ws` server that
holds your provider keys, exposes chat, guarded file operations, guarded
terminal execution, and a live WebSocket stream — all behind a bearer token
and a workspace jail.

This is **Phase 0** of [the roadmap](../nexus-agentrouter-roadmap.md): a locked-down
skeleton. The multi-provider switcher (Phase 1) and the tool-calling agent
loop (Phase 2) slot in behind the endpoints that already exist here.

## Endpoints

| Method | Path          | Auth | Purpose                                            |
|--------|---------------|------|----------------------------------------------------|
| GET    | `/health`     | no   | Liveness probe (also reports the workspace path)   |
| POST   | `/chat`       | yes  | Chat completion via the configured provider        |
| POST   | `/agent`      | yes  | Start an agentic task (Phase 2 — reserved for now) |
| GET    | `/files`      | yes  | Workspace file tree                                |
| POST   | `/file/read`  | yes  | Read a file (`{ "path": "app/index.js" }`)         |
| POST   | `/file/write` | yes  | Create/overwrite (`{ "path": "...", "content": "..." }`) |
| POST   | `/exec`       | yes  | Run a command (`{ "cmd": "npm test", "cwd": "." }`)|
| WS     | `/stream`     | yes  | Live events: file writes, exec output, agent steps |

All authed requests need `Authorization: Bearer <AGENT_TOKEN>`.
The WebSocket may pass it as `?token=<AGENT_TOKEN>` since browsers can't set
headers on a WS handshake.

## Security model (roadmap Phase 0 checklist)

- **Token auth** — constant-time compare on every HTTP + WS request.
- **Workspace jail** — every path resolves inside `WORKSPACE`; `..`,
  absolute-path escapes, and symlink escapes are rejected.
- **Command filter** — a blacklist refuses `rm -rf /`, `mkfs`, `dd of=/dev/*`,
  fork bombs, `curl … | sh`, disk wipes, etc. An optional `EXEC_ALLOWLIST`
  restricts execution to named binaries only.
- **Exec sandboxing** — commands run with `cwd` forced into the jail, `HOME`
  repointed at the jail, a hard timeout, and capped output.
- **Rate limiting** — fixed-window per IP.
- **Audit log** — every command, file write, block, and auth failure is
  appended to `logs/audit.log`.
- **Loopback bind** — binds `127.0.0.1` by default; expose only via tunnel.

## Setup

```bash
cd server
npm install
cp .env.example .env
# generate a strong token:
openssl rand -hex 32           # paste into AGENT_TOKEN
# set WORKSPACE, and PROVIDER_* for /chat
npm start                      # or: npm run dev  (watch mode)
```

### Provider config (`/chat`)

Set these in `.env` for the default provider:

```
PROVIDER_TRANSPORT=openai                 # or "anthropic"
PROVIDER_BASE_URL=https://openrouter.ai/api/v1
PROVIDER_KEY=sk-...
PROVIDER_MODEL=meta-llama/llama-3.1-8b-instruct:free
```

OpenRouter `:free` models and NVIDIA NIM are the cheapest way to develop the
agent loop (roadmap Phase 1 / cost note). Anthropic-shaped gateways
(AgentRouter) work with `PROVIDER_TRANSPORT=anthropic`.

## Multiple providers (Phase 1)

The `.env` `PROVIDER_*` is the default provider. To offer more (and switch
between them from the app's **Settings → AI Provider** menu), add
`server/providers.json` — an array of entries. Use a preset for the common
ones so you only supply a key and model:

```json
[
  { "id": "openrouter", "preset": "openrouter", "key": "sk-or-...", "model": "meta-llama/llama-3.3-70b-instruct:free" },
  { "id": "nvidia", "preset": "nvidia", "key": "nvapi-...", "model": "meta/llama-3.1-70b-instruct" }
]
```

Presets: `agentrouter`, `openrouter`, `nvidia`, `groq`, `together`, `ollama`.
For anything else, give `transport` (`openai` or `anthropic`) + `baseUrl`
explicitly. See `providers.example.json`. Restart after editing. The file is
gitignored (it holds keys). `GET /providers` lists them (never the keys).

Agent mode (tool use) works on both `openai` and `anthropic` transports —
so you can develop the agent on free OpenRouter/NVIDIA models and save
AgentRouter credits for real runs.

## Run 24/7 with PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # follow the printed command to survive reboots
pm2 logs nexus-agent
```

## Expose securely with Cloudflare Tunnel

Keep the port closed on the firewall; publish only the tunnel.

```bash
# install cloudflared, then:
cloudflared tunnel login
cloudflared tunnel create nexus-agent
# route a hostname to the local server:
cloudflared tunnel route dns nexus-agent agent.yourdomain.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: agent.yourdomain.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

```bash
cloudflared tunnel run nexus-agent      # or install as a service
```

## Connect the Nexus frontend

The frontend (`../nexus-agentrouter-chat-4.html`) has a **Settings → Route**
toggle:

- **Direct API** — the browser calls the gateway itself (original behavior).
- **VPS Backend** — chat is routed through this server. Enter the backend
  URL (e.g. `https://agent.yourdomain.com`) and the `AGENT_TOKEN`. The
  provider key then lives only on the server, never in the browser.

In backend mode `/chat` streams an OpenAI-shaped SSE response, so replies
render token-by-token exactly like the direct path. Set `CORS_ORIGINS` to
the origin serving the UI so the browser is allowed to call the backend.

## Smoke test

```bash
TOKEN=<your AGENT_TOKEN>
BASE=http://127.0.0.1:8787

curl -s $BASE/health
curl -s $BASE/file/write -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"path":"hello.txt","content":"hi from nexus"}'
curl -s $BASE/file/read  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"path":"hello.txt"}'
curl -s $BASE/exec -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"cmd":"ls -la"}'
# jail + filter should both refuse:
curl -s $BASE/file/read -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"path":"../../etc/passwd"}'
curl -s $BASE/exec -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"cmd":"rm -rf /"}'

# streaming chat (needs PROVIDER_* set) — should emit SSE deltas then [DONE]:
curl -sN $BASE/chat -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"stream":true,"messages":[{"role":"user","content":"say hi"}]}'
```
