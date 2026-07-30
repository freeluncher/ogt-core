import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// Client-side, dipakai HANYA untuk auth (login/session/JWT) — semua data lewat backend API
// (lib/api.ts), bukan query tabel langsung. Lihat plan "Web App Quotation Builder — Sales UI".
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
