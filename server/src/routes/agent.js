// ── POST /agent ──────────────────────────────────────────────
// Runs an agentic task and streams live steps back as SSE so the phone
// shows the agent thinking and using tools. Each SSE line is:
//   data: {"type":"tool","name":"list_files","input":{...}}
//   data: {"type":"tool_result","name":"list_files","preview":"…"}
//   data: {"type":"final","text":"…"}
//   data: [DONE]
//
// v1 tools are read-only (list_files / read_file / search_code).

import { Router } from 'express';
import { runAgent } from '../agent/loop.js';
import { resolveApproval } from '../agent/approvals.js';
import { publish } from '../bus.js';
import { info, error } from '../logger.js';

const router = Router();

// The phone posts here to approve/reject a paused mutating action.
router.post('/agent/approve', (req, res) => {
  const { id, decision } = req.body || {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'id is required' });
  const approved = decision === true || decision === 'approve' || decision === 'approved';
  const matched = resolveApproval(id, approved);
  res.json({ ok: matched, approved });
});

router.post('/agent', async (req, res) => {
  const { task, model, providerId, autoApprove } = req.body || {};
  if (typeof task !== 'string' || !task.trim()) {
    return res.status(400).json({ error: 'task (string) is required' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClose);

  const send = (ev) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  };

  info(`agent task: ${task.slice(0, 80)}`);
  try {
    await runAgent({
      task,
      model, // undefined → backend uses its default (tool-capable) model
      providerId,
      autoApprove: autoApprove === true,
      signal: controller.signal,
      onEvent: (ev) => {
        send(ev);
        publish(`agent:${ev.type}`, ev); // also to WS /stream subscribers
      },
    });
  } catch (e) {
    if (!controller.signal.aborted) {
      error('agent failed:', e.message);
      send({ type: 'error', message: e.message });
    }
  } finally {
    res.off('close', onClose);
    if (!res.writableEnded) res.write('data: [DONE]\n\n');
    res.end();
  }
});

export default router;
