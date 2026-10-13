export type Call = { url: string; init?: RequestInit }

export const KEY = 'sk-or-secret-test-key'
export const USER_TOKEN = 'user-token'
export const AUTH_ENV = { SUPABASE_URL: 'http://sb', SUPABASE_ANON_KEY: 'anon-key' }

// Supabase Auth stand-in: only USER_TOKEN is a logged-in user (an anon-key JWT is not).
const authUser = (init?: RequestInit) =>
  new Headers(init?.headers).get('Authorization') === `Bearer ${USER_TOKEN}`
    ? Response.json({ id: 'u1', role: 'authenticated' })
    : Response.json({ msg: 'invalid claim: missing sub claim' }, { status: 403 })

// Routes by URL suffix; records every call.
export function stubFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: Call[] = []
  const all = { '/auth/v1/user': authUser, ...routes }
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const key = Object.keys(all).find((k) => url.endsWith(k))
    if (!key) throw new TypeError('network down')
    return all[key as keyof typeof all](init)
  }) as typeof fetch
  return { fn, calls }
}

export const authed = (url: string, init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { Authorization: `Bearer ${USER_TOKEN}`, ...init.headers } })

export async function expectNoKey(res: Response) {
  const body = await res.clone().text()
  const headers = JSON.stringify([...res.headers])
  if (body.includes(KEY) || headers.includes(KEY)) throw new Error('key leaked')
}
