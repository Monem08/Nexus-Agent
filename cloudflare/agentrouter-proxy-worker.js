// AgentRouter proxy worker — fixes CORS + "unauthorized client detected"
//
// This is the default CORS proxy the Nexus FRONTEND uses in "Direct" mode
// (extracted from nexus-agentrouter-chat-4.html). Deploy free at
// dash.cloudflare.com → Workers → Create → paste → Deploy. Then put the
// worker URL in the app's Settings → CORS Proxy.
//
// Usage: https://<your-worker>.workers.dev/https://agentrouter.org/v1/...
//
// NOTE: this worker forwards browser → AgentRouter. It does NOT reach your
// VPS backend. To connect the phone to the VPS, use a Cloudflare *Tunnel*
// (see ../server/README.md), which is a different tool.
export default {
  async fetch(request) {
    const CORS = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    // Path after the worker origin is the full target URL
    const url = new URL(request.url);
    let target = url.pathname.slice(1) + url.search;
    target = target.replace(/^(https?):\/([^/])/i, "$1://$2");
    if (target.startsWith("http") === false) {
      return new Response("Append the full https:// target URL", { status: 400, headers: CORS });
    }

    // Rebuild headers, spoofing a real Claude Code client so the WAF trusts us
    const h = new Headers(request.headers);
    h.set("user-agent", "claude-cli/1.0.60 (external, cli)");
    h.set("x-app", "cli");
    h.delete("origin");
    h.delete("referer");
    h.delete("host");

    const resp = await fetch(target, {
      method: request.method,
      headers: h,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    });

    // Stream response back with CORS headers
    const out = new Headers(resp.headers);
    Object.entries(CORS).forEach(([k, v]) => out.set(k, v));
    return new Response(resp.body, { status: resp.status, headers: out });
  },
};
