// ── Event bus ────────────────────────────────────────────────
// Tiny pub/sub so HTTP routes (and, later, the agent loop) can push live
// updates to connected WebSocket clients on /stream.

import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

// Broadcast an event to all /stream subscribers.
export function publish(type, payload = {}) {
  emitter.emit('event', { type, ts: Date.now(), ...payload });
}

export function subscribe(handler) {
  emitter.on('event', handler);
  return () => emitter.off('event', handler);
}
