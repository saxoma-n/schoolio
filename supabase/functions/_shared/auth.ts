import { errorResponse, unavailable } from './cors.ts'
import type { Env } from './env.ts'

// Returns a response to send back if the caller is not a logged-in user, else null.
// Checked here (verify_jwt is off) because the public anon key is itself a valid project JWT.
export async function rejectUnlessUser(req: Request, env: Env, fetchFn: typeof fetch): Promise<Response | null> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return errorResponse(401, 'unauthorized', 'Please log in again.')
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return unavailable()
  try {
    const res = await fetchFn(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY } })
    return res.ok ? null : errorResponse(401, 'unauthorized', 'Please log in again.')
  } catch {
    return unavailable()
  }
}
