import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const supabaseUrl = viteEnv?.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = viteEnv?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

// Publishable keys are designed for browser use; never use a secret/service-role key here.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: { autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', persistSession: true },
      })
    : null;
