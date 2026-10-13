// @vitest-environment node
import { expect, test } from 'vitest'
import { handleChat } from '../../supabase/functions/chat/handler.ts'
import { AUTH_ENV, KEY, authed, expectNoKey, stubFetch } from './stub'

const BASE = 'http://mock/api/v1'
const env = { ...AUTH_ENV, OPENROUTER_API_KEY: KEY, OPENROUTER_BASE_URL: BASE }
const SSE = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n'
const models = { data: [{ id: 'a/b', name: 'AB', context_length: 1, pricing: { prompt: '0.1', completion: '0' } }] }
const routes = {
  '/chat/completions': () => new Response(SSE, { headers: { 'Content-Type': 'text/event-stream' } }),
  '/models': () => Response.json(models),
}
const post = (body: unknown) => authed('http://fn/chat', { method: 'POST', body: JSON.stringify(body) })
const msgs = [{ role: 'user', content: 'hi' }]

test('OPTIONS returns CORS headers', async () => {
  const res = await handleChat(new Request('http://fn/chat', { method: 'OPTIONS' }), env, stubFetch(routes).fn)
  expect(res.status).toBe(200)
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
})

test('no key gives 503 Model service unavailable.', async () => {
  const res = await handleChat(post({ model: 'a/b:free', messages: msgs }), AUTH_ENV, stubFetch(routes).fn)
  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ error: { code: 'unavailable', message: 'Model service unavailable.' } })
})

test('missing model or messages gives 400 bad_request', async () => {
  for (const body of [{ messages: msgs }, { model: 'a/b:free' }, { model: 'a/b:free', messages: 'x' }]) {
    const res = await handleChat(post(body), env, stubFetch(routes).fn)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('bad_request')
  }
})

test('invalid JSON gives 400 bad_request', async () => {
  const res = await handleChat(authed('http://fn/chat', { method: 'POST', body: '{' }), env, stubFetch(routes).fn)
  expect(res.status).toBe(400)
})

test('paid model is rejected by default', async () => {
  const res = await handleChat(post({ model: 'a/b', messages: msgs }), env, stubFetch(routes).fn)
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: { code: 'paid_model', message: 'Only free models are enabled.' } })
})

test('unknown non-free model is rejected', async () => {
  const res = await handleChat(post({ model: 'z/z', messages: msgs }), env, stubFetch(routes).fn)
  expect((await res.json()).error.code).toBe('paid_model')
})

test('paid model forwards when ALLOW_PAID_MODELS=true', async () => {
  const s = stubFetch(routes)
  const res = await handleChat(post({ model: 'a/b', messages: msgs }), { ...env, ALLOW_PAID_MODELS: 'true' }, s.fn)
  expect(res.status).toBe(200)
  expect(s.calls.some((c) => c.url === `${BASE}/chat/completions`)).toBe(true)
})

test('free model forwards with key, stream and usage, and passes SSE through unchanged', async () => {
  const s = stubFetch(routes)
  const res = await handleChat(post({ model: 'a/b:free', messages: msgs }), env, s.fn)
  const call = s.calls.find((c) => c.url === `${BASE}/chat/completions`)!
  expect(new Headers(call.init!.headers).get('Authorization')).toBe(`Bearer ${KEY}`)
  expect(JSON.parse(String(call.init!.body))).toMatchObject({ model: 'a/b:free', messages: msgs, stream: true, usage: { include: true } })
  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Type')).toBe('text/event-stream')
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  await expectNoKey(res)
  expect(await res.text()).toBe(SSE)
})

test('upstream 429 passes through as upstream error', async () => {
  const s = stubFetch({ '/chat/completions': () => Response.json({ error: { message: `Rate limited ${KEY}` } }, { status: 429 }) })
  const res = await handleChat(post({ model: 'a/b:free', messages: msgs }), env, s.fn)
  expect(res.status).toBe(429)
  await expectNoKey(res)
  expect((await res.json()).error.code).toBe('upstream')
})

test('upstream unreachable gives 503', async () => {
  const res = await handleChat(post({ model: 'a/b:free', messages: msgs }), env, stubFetch({}).fn)
  expect(res.status).toBe(503)
  await expectNoKey(res)
})

test('request without a token is rejected with 401 before reaching OpenRouter', async () => {
  const s = stubFetch(routes)
  const res = await handleChat(new Request('http://fn/chat', { method: 'POST', body: '{}' }), env, s.fn)
  expect(res.status).toBe(401)
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(s.calls.some((c) => c.url.includes('/chat/completions'))).toBe(false)
})

test('the public anon key is not accepted as a login', async () => {
  const s = stubFetch(routes)
  const req = new Request('http://fn/chat', { method: 'POST', headers: { Authorization: 'Bearer anon-key' }, body: JSON.stringify({ model: 'a/b:free', messages: msgs }) })
  const res = await handleChat(req, env, s.fn)
  expect(res.status).toBe(401)
  expect(s.calls.some((c) => c.url.includes('/chat/completions'))).toBe(false)
  const authCall = s.calls.find((c) => c.url === 'http://sb/auth/v1/user')!
  expect(new Headers(authCall.init!.headers).get('apikey')).toBe('anon-key')
})
