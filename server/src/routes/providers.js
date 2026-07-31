// ── GET /providers ───────────────────────────────────────────
// Lists the AI providers configured on this backend so the app can show a
// switcher. Keys are never included — only whether one is present.

import { Router } from 'express';
import { listProviders } from '../providers/index.js';

const router = Router();

router.get('/providers', (_req, res) => {
  res.json({ providers: listProviders() });
});

export default router;
