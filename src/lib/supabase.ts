import { createClient } from '@supabase/supabase-js'

// Both values are public by design (they ship to every visitor's browser);
// row-level security in the database is what protects each user's data.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://xcycunyvotgmrwgutgty.supabase.co'
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_xPzFErH6PyeHoTCTdNPr0w_lLhCLY9v'

export const isConfigured = Boolean(url && anonKey)

// The address of this site (for example https://<user>.github.io/resume-master/).
// Email links (confirm account, reset password) come back here.
export const siteUrl = window.location.origin + window.location.pathname

// Read what an email link brought back before the Supabase client clears it.
// Supabase puts errors in the query string (PKCE) or in the hash.
function readEmailLinkResult() {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''))
  const description =
    query.get('error_description') || hash.get('error_description') || query.get('error') || hash.get('error')
  return {
    error: description ? description.replace(/\+/g, ' ') : null,
    isPasswordReset: query.get('reset') === '1',
    hadCode: query.has('code'),
  }
}

export const emailLinkResult = readEmailLinkResult()

// Remove the auth values from the address bar, but keep the page route (#/...).
export function clearEmailLinkFromUrl() {
  if (window.location.search) {
    window.history.replaceState(null, '', window.location.pathname + (window.location.hash.startsWith('#/') ? window.location.hash : '#/'))
  }
}

export const supabase = createClient(url, anonKey || 'missing', {
  // PKCE puts the auth code in the query string, which plays well with HashRouter.
  auth: { flowType: 'pkce' },
})
