// ── POST /chat ───────────────────────────────────────────────
// Ports the current Nexus chat feature to the backend: the phone sends
// messages, the VPS holds the provider key and talks to the AI. No tools,
// no file access — just conversation (roadmap Phase 0 milestone).
//
// Set `"stream": true` in the body to receive an OpenAI-shaped SSE stream
// (data: {choices:[{delta:{content}}]} … data: [DONE]) so the existing
// Nexus frontend parser can consume it unchanged. Otherwise a single JSON
// { text, model } is returned.

import { Router } from 'express';
import { chatComplete, chatStream } from '../providers/index.js';
import { publish } from '../bus.js';
import { info, error } from '../logger.js';

const router = Router();

router.post('/chat', async (req, res) => {
  const { messages, model, providerId, temperature, stream } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages[] is required' });
  }
  for (const m of messages) {
    // content may be a plain string or an array (text + image parts).
    const okContent = typeof m?.content === 'string' || Array.isArray(m?.content);
    if (!m || !m.role || !okContent) {
      return res.status(400).json({ error: 'each message needs {role, content:string|array}' });
    }
  }

  const temp = typeof temperature === 'number' ? temperature : 0.7;

  // Abort upstream only if the client disconnects before we finish.
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClose);

  // ── Streaming path (SSE) ──
  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    publish('chat:start', { model: model || null, stream: true });
    try {
      for await (const delta of chatStream({ providerId, model, messages, temperature: temp, signal: controller.signal })) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      publish('chat:done', { model: model || null });
    } catch (e) {
      if (!controller.signal.aborted) {
        error('chat stream failed:', e.message);
        res.write(`data: ${JSON.stringify({ error: { message: e.message } })}\n\n`);
      }
    } finally {
      res.off('close', onClose);
      res.end();
    }
    return;
  }

  // ── Non-streaming path (single JSON) ──
  try {
    publish('chat:start', { model: model || null });
    const result = await chatComplete({ providerId, model, messages, temperature: temp, signal: controller.signal });
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
