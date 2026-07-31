// ── POST /chat ───────────────────────────────────────────────
// Ports the current Nexus chat feature to the backend: the phone sends
// messages, the VPS holds the provider key and talks to the AI. No tools,
// no file access — just conversation (roadmap Phase 0 milestone).

import { Router } from 'express';
import { chatComplete } from '../providers/index.js';
import { publish } from '../bus.js';
import { info, error } from '../logger.js';

const router = Router();

router.post('/chat', async (req, res) => {
  const { messages, model, providerId, temperature } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages[] is required' });
  }
  for (const m of messages) {
    if (!m || typeof m.content !== 'string' || !m.role) {
      return res.status(400).json({ error: 'each message needs {role, content}' });
    }
  }

  // Abort the upstream call only if the client disconnects before we've
  // finished responding. Listen on the *response* — `req`'s "close" also
  // fires on normal body-read completion, which would abort every call.
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClose);

  try {
    publish('chat:start', { model: model || null });
    const result = await chatComplete({
      providerId,
      model,
      messages,
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      signal: controller.signal,
    });
    info(`chat ok (${result.model})`);
    publish('chat:done', { model: result.model });
    res.json({ text: result.text, model: result.model });
  } catch (e) {
    if (controller.signal.aborted) return; // client hung up
    error('chat failed:', e.message);
    res.status(e.status || 500).json({ error: e.message });
  } finally {
    res.off('close', onClose);
  }
});

export default router;
