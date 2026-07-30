/**
 * Middleware: requireAuth
 *
 * Verifikasi Supabase JWT dari header Authorization: Bearer <token>,
 * lalu lookup row `sales` yang terhubung (via auth_user_id) dan attach ke req.sales.
 * Dipakai untuk semua endpoint web app (submissions/quotations/services-catalog) —
 * BUKAN untuk webhook Siagga (itu pakai validateSecret).
 *
 * Return 401 jika token tidak ada/invalid, 403 jika token valid tapi
 * user tidak terdaftar sebagai sales aktif.
 */
const { getSupabaseClient } = require('../db/supabase');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized: token tidak ada' });
  }

  const supabase = getSupabaseClient();

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized: token tidak valid' });
  }

  const { data: sales, error: salesError } = await supabase
    .from('sales')
    .select('id, name, email, is_active')
    .eq('auth_user_id', userData.user.id)
    .single();

  if (salesError || !sales || !sales.is_active) {
    return res.status(403).json({ status: 'error', message: 'Forbidden: akun tidak terdaftar sebagai sales aktif' });
  }

  req.sales = sales;
  next();
}

module.exports = requireAuth;
