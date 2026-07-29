/**
 * Middleware: validateSecret
 *
 * Cek header X-Webhook-Secret sebelum proses apapun.
 * Sesuai §2.4 PRD & AGENTS.md — validasi ini HARUS jadi langkah PERTAMA di handler.
 *
 * Return 401 jika:
 *   - Header tidak ada
 *   - Nilai tidak cocok dengan WEBHOOK_SECRET di env
 */
function validateSecret(req, res, next) {
  const incomingSecret = req.headers['x-webhook-secret'];

  if (!incomingSecret || incomingSecret !== process.env.WEBHOOK_SECRET) {
    console.warn('[AUTH] Webhook request ditolak — secret salah atau tidak ada', {
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized: X-Webhook-Secret tidak valid atau tidak ada',
    });
  }

  next();
}

module.exports = validateSecret;
