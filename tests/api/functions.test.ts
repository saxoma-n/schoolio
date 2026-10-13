import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('../../src/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}))

import { fetchModels, streamChat } from '../../src/api/functions'
import { ApiError } from '../../src/lib/errors'

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

test('streamChat posts with bearer token and yields parsed events', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'))
  vi.stubGlobal('fetch', fetchMock)
  const events = []
  for await (const e of streamChat('a/b:free', [{ role: 'user', content: 'yo' }])) events.push(e)
  expect(events).toEqual([{ type: 'delta', text: 'hi' }])
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('https://proj.supabase.co/functions/v1/chat')
  expect(init.method).toBe('POST')
  expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', apikey: 'anon' })
  expect(JSON.parse(init.body)).toEqual({ model: 'a/b:free', messages: [{ role: 'user', content: 'yo' }] })
})

test('streamChat throws ApiError on 429', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'upstream', message: 'slow down' } }, { status: 429 })))
  const it = streamChat('a/b:free', [])
  await expect(it.next()).rejects.toMatchObject({ status: 429, code: 'upstream' })
  await expect(streamChat('a/b:free', []).next()).rejects.toBeInstanceOf(ApiError)
})

test('fetchModels GETs the models function', async () => {
  const body = { allowPaid: false, models: [] }
  const fetchMock = vi.fn().mockResolvedValue(Response.json(body))
  vi.stubGlobal('fetch', fetchMock)
  expect(await fetchModels()).toEqual(body)
  expect(fetchMock.mock.calls[0][0]).toBe('https://proj.supabase.co/functions/v1/models')
})
