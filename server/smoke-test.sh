#!/usr/bin/env bash
# ── Nexus Agent — one-command smoke test ─────────────────────
# Boots the server on a scratch port + scratch workspace, exercises every
# endpoint (including the security rejections), prints PASS/FAIL, then
# tears everything down. Does NOT touch your real .env or workspace.
#
#   cd server && ./smoke-test.sh
#
# If PROVIDER_* is set in your .env it also runs a live streaming chat.

set -u
cd "$(dirname "$0")"

PORT=8799
TOKEN="smoke_$(date +%s)_abcdefghijklmnop"
WS="$(mktemp -d)"
BASE="http://127.0.0.1:$PORT"
PASS=0; FAIL=0

# Pull PROVIDER_* from an existing .env (if any) so we can test real chat.
PROV=""
if [ -f .env ]; then
  PROV=$(grep -E '^PROVIDER_' .env 2>/dev/null)
fi

TMP_ENV="$(mktemp)"
{
  echo "HOST=127.0.0.1"
  echo "PORT=$PORT"
  echo "AGENT_TOKEN=$TOKEN"
  echo "WORKSPACE=$WS"
  echo "$PROV"
} > "$TMP_ENV"

echo "▶ booting server (port $PORT, workspace $WS)…"
mkdir -p logs
env $(grep -vE '^\s*#' "$TMP_ENV" | xargs) node src/server.js > logs/smoke.log 2>&1 &
SRV=$!
cleanup() { kill -9 "$SRV" 2>/dev/null; rm -rf "$WS" "$TMP_ENV"; }
trap cleanup EXIT
sleep 1.3

if ! kill -0 "$SRV" 2>/dev/null; then
  echo "✗ server failed to start:"; cat logs/smoke.log; exit 1
fi

# check <name> <expected-substring> <curl-args...>
check() {
  local name="$1" expect="$2"; shift 2
  local out; out=$(curl -s -m 8 "$@")
  if echo "$out" | grep -q -- "$expect"; then
    echo "  ✓ $name"; PASS=$((PASS+1))
  else
    echo "  ✗ $name — expected '$expect', got: $out"; FAIL=$((FAIL+1))
  fi
}
AUTH=(-H "Authorization: Bearer $TOKEN")
JSON=(-H "Content-Type: application/json")

echo "▶ endpoints"
check "health"          '"ok":true'          "$BASE/health"
check "auth required"   'unauthorized'       "$BASE/files"
check "file write"      '"ok":true'          "${AUTH[@]}" "${JSON[@]}" -d '{"path":"a/b.txt","content":"hello"}' "$BASE/file/write"
check "file read"       'hello'              "${AUTH[@]}" "${JSON[@]}" -d '{"path":"a/b.txt"}' "$BASE/file/read"
check "file tree"       '"b.txt"'            "${AUTH[@]}" "$BASE/files"
check "exec ok"         'nexus-ok'           "${AUTH[@]}" "${JSON[@]}" -d '{"cmd":"echo nexus-ok"}' "$BASE/exec"

echo "▶ security"
check "jail escape blocked"   'escapes the workspace jail' "${AUTH[@]}" "${JSON[@]}" -d '{"path":"../../../etc/passwd"}' "$BASE/file/read"
check "rm -rf / blocked"      'blocked'                    "${AUTH[@]}" "${JSON[@]}" -d '{"cmd":"rm -rf /"}' "$BASE/exec"
check "fork bomb blocked"     'blocked'                    "${AUTH[@]}" "${JSON[@]}" -d '{"cmd":":(){ :|:& };:"}' "$BASE/exec"
check "exec cwd escape blocked" 'escapes the workspace jail' "${AUTH[@]}" "${JSON[@]}" -d '{"cmd":"ls","cwd":"../../"}' "$BASE/exec"

echo "▶ chat"
if echo "$PROV" | grep -q 'PROVIDER_KEY=..'; then
  echo "  provider configured — testing live streaming chat…"
  OUT=$(curl -sN -m 20 "${AUTH[@]}" "${JSON[@]}" \
    -d '{"stream":true,"messages":[{"role":"user","content":"Reply with exactly: NEXUS-LIVE"}]}' "$BASE/chat")
  if echo "$OUT" | grep -q 'data:'; then
    echo "  ✓ live chat streamed SSE"; PASS=$((PASS+1))
    echo "$OUT" | grep -o '"content":"[^"]*"' | head -20 | sed 's/^/      /'
  else
    echo "  ✗ live chat — no SSE. Response: $OUT"; FAIL=$((FAIL+1))
  fi
else
  check "no-provider guard" 'no AI provider' "${AUTH[@]}" "${JSON[@]}" -d '{"messages":[{"role":"user","content":"hi"}]}' "$BASE/chat"
  echo "  (set PROVIDER_* in .env to test real chat)"
fi

echo
echo "──────────────────────────────"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "──────────────────────────────"
[ "$FAIL" -eq 0 ] && echo "✅ all good" || echo "❌ see failures above"
exit "$FAIL"
