// ── Approval gate ────────────────────────────────────────────
// Mutating agent actions (write a file, run a command) pause here until the
// user taps Approve or Reject on the phone. The agent loop awaits a promise
// keyed by a request id; POST /agent/approve resolves it. Single Node
// process, so a module-level Map is all the shared state we need.

const pending = new Map(); // id -> { resolve, timer }

// Called by the agent loop. Resolves to true (approved) / false (rejected).
export function requestApproval(id, { timeoutMs = 5 * 60 * 1000, signal } = {}) {
  return new Promise((resolve) => {
    const done = (decision) => {
      const entry = pending.get(id);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(id);
      }
      resolve(decision);
    };
    const timer = setTimeout(() => done(false), timeoutMs); // auto-reject on timeout
    pending.set(id, { resolve: done, timer });
    // If the client disconnects, treat as rejection so the loop can end.
    if (signal) signal.addEventListener('abort', () => done(false), { once: true });
  });
}

// Called by POST /agent/approve. Returns true if a matching request existed.
export function resolveApproval(id, approved) {
  const entry = pending.get(id);
  if (!entry) return false;
  entry.resolve(Boolean(approved));
  return true;
}
