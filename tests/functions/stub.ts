export type Call = { url: string; init?: RequestInit }

// Routes by URL suffix; records every call.
export function stubFetch(routes: Record<string, () => Response>) {
  const calls: Call[] = []
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const key = Object.keys(routes).find((k) => url.endsWith(k))
    if (!key) throw new TypeError('network down')
    return routes[key]()
  }) as typeof fetch
  return { fn, calls }
}

export const KEY = 'sk-or-secret-test-key'

export async function expectNoKey(res: Response) {
  const body = await res.clone().text()
  const headers = JSON.stringify([...res.headers])
  if (body.includes(KEY) || headers.includes(KEY)) throw new Error('key leaked')
}
