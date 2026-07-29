const express = require('express');
const router = express.Router();

/**
 * GET /api/health
 * Dipakai untuk ping Render free tier supaya tidak sleep saat demo.
 * Sesuai §7 PRD & AGENTS.md — wajib ada, selalu 200.
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'OGT Webhook Backend',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
