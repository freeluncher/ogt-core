const { createClient } = require('@supabase/supabase-js');

// Singleton Supabase client — gunakan service key untuk full DB access
// dari server-side (tidak expose ke browser)
let _client = null;

function getSupabaseClient() {
  if (_client) return _client;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'SUPABASE_URL dan SUPABASE_SERVICE_KEY harus diisi di environment variable'
    );
  }

  _client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      // Service key tidak butuh auto-refresh token
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}

module.exports = { getSupabaseClient };
