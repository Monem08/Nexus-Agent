// ── POST /agent ──────────────────────────────────────────────
// Phase 0 placeholder for the agentic loop. The endpoint, auth, streaming
// wiring, and contract are in place now so Phase 2 can drop the real
// tool-calling loop in behind it without touching the transport layer.
//
// For now it accepts a task, emits a couple of stream events, and returns
// a "not yet implemented" acknowledgement so the UI can be built against it.

import { Router } from 'express';
import { publish } from '../bus.js';
import { info } from '../logger.js';

const router = Router();

router.post('/agent', (req, res) => {
  const { task } = req.body || {};
  if (typeof task !== 'string' || !task.trim()) {
    return res.status(400).json({ error: 'task (string) is required' });
  }

  const id = `task_${Date.now().toString(36)}`;
  info(`agent task received (${id}): ${task.slice(0, 80)}`);
  publish('agent:accepted', { id, task });

  // Phase 2 will run the read/plan/edit/exec loop here and stream steps.
  res.status(202).json({
    id,
    status: 'accepted',
    note: 'agent loop lands in Phase 2 — endpoint reserved. Subscribe to /stream for updates.',
  });
});

export default router;
