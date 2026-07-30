/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev-only: proxy /api/* ke backend Express lokal (default port 3001, sesuaikan lewat BACKEND_URL).
  // Di production (satu Vercel project), routing /api/* ke backend/src/index.js sudah
  // ditangani di root vercel.json — rewrite ini tidak dipakai di sana.
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },
};

module.exports = nextConfig;
