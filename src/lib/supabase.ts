import { createClient } from '@supabase/supabase-js'

// Both values are public by design (they ship to every visitor's browser);
// row-level security in the database is what protects each user's data.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://xcycunyvotgmrwgutgty.supabase.co'
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_xPzFErH6PyeHoTCTdNPr0w_lLhCLY9v'

export const isConfigured = Boolean(url && anonKey)

export const supabase = createClient(url, anonKey || 'missing', {
  // PKCE puts the auth code in the query string, which plays well with HashRouter.
  auth: { flowType: 'pkce' },
})
