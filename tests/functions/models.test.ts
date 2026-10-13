// @vitest-environment node
import { expect, test } from 'vitest'
import { handleModels } from '../../supabase/functions/models/handler.ts'
import { KEY, expectNoKey, stubFetch } from './stub'

const upstream = {
  data: [
    { id: 'a/b:free', name: 'AB', context_length: 8192, pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'] }, extra: 1 },
    { id: 'c/d', name: 'CD', context_length: 4096, pricing: { prompt: '0.1', completion: '0.2' } },
  ],
}
const ok = () => stubFetch({ '/models': () => Response.json(upstream) })
const get = () => new Request('http://fn/models')

test('OPTIONS returns CORS headers', async () => {
  const res = await handleModels(new Request('http://fn/models', { method: 'OPTIONS' }), {}, ok().fn)
  expect(res.status).toBe(200)
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
})

test('maps upstream models to the spec shape', async () => {
  const res = await handleModels(get(), { OPENROUTER_API_KEY: KEY }, ok().fn)
  expect(res.status).toBe(200)
  expect(res.headers.get('Cache-Control')).toBe('max-age=3600')
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(await res.json()).toEqual({
    allowPaid: false,
    models: [
      { id: 'a/b:free', name: 'AB', context_length: 8192, pricing: { prompt: '0', completion: '0' }, input_modalities: ['text', 'image'] },
      { id: 'c/d', name: 'CD', context_length: 4096, pricing: { prompt: '0.1', completion: '0.2' }, input_modalities: ['text'] },
    ],
  })
})

test('allowPaid mirrors ALLOW_PAID_MODELS', async () => {
  const res = await handleModels(get(), { OPENROUTER_API_KEY: KEY, ALLOW_PAID_MODELS: 'true' }, ok().fn)
  expect((await res.json()).allowPaid).toBe(true)
})

test('no key gives 503 unavailable', async () => {
  const res = await handleModels(get(), {}, ok().fn)
  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ error: { code: 'unavailable', message: 'Model service unavailable.' } })
})

test('upstream unreachable gives 503 and never leaks the key', async () => {
  const res = await handleModels(get(), { OPENROUTER_API_KEY: KEY }, stubFetch({}).fn)
  expect(res.status).toBe(503)
  await expectNoKey(res)
})
