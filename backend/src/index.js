require('dotenv').config();
const express = require('express');

const healthRouter = require('./routes/health');
const webhookRouter = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON body — limit 10mb untuk handle payload itinerary yang besar
app.use(express.json({ limit: '10mb' }));

// ================================
// Routes
// ================================
app.use('/api/health', healthRouter);
app.use('/api/webhooks', webhookRouter);

// ================================
// Global Error Handler
// Sesuai kontrak API: selalu return {status:"error", message}
// ================================
app.use((err, req, res, next) => {
  console.error('[ERROR]', new Date().toISOString(), err.message, err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Terjadi kesalahan internal',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Endpoint tidak ditemukan' });
});

// ================================
// Start server
// ================================
app.listen(PORT, () => {
  console.log(`[OGT Webhook Backend] Server berjalan di port ${PORT}`);
  console.log(`[OGT Webhook Backend] Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
