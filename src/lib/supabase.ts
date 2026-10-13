import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  // PKCE puts the reset code in ?code=, which survives the HashRouter's #/ routes
  { auth: { flowType: 'pkce' } },
)
