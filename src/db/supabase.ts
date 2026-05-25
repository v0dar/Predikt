import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Validate required env vars before creating client ────────────────────────

const SUPABASE_URL = process.env['SUPABASE_URL'];
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    '[DB] Missing required environment variables: ' +
      [!SUPABASE_URL && 'SUPABASE_URL', !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY']
        .filter(Boolean)
        .join(', '),
  );
}

// ─── Service role client (bot use only — never expose to browser) ─────────────
//
// The service role key bypasses Row Level Security. It is used exclusively by
// the bot's server-side modules. The dashboard browser JS uses SUPABASE_ANON_KEY
// (passed as a public env var to the frontend), which respects RLS policies.

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ─── Connection verification ──────────────────────────────────────────────────

export async function verifyConnection(): Promise<void> {
  const { error } = await supabase.from('bot_status').select('id').limit(1).single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`[DB] Supabase connection failed: ${error.message}`);
  }

  console.log('[DB] Supabase connection verified.');
}
