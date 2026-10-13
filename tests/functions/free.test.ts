// @vitest-environment node
import { expect, test } from 'vitest'
import { isFreeModel } from '../../supabase/functions/_shared/free.ts'

test(':free suffix is free', () => {
  expect(isFreeModel({ id: 'x/y:free' })).toBe(true)
})
test('zero pricing is free', () => {
  expect(isFreeModel({ id: 'x/y', pricing: { prompt: '0', completion: '0' } })).toBe(true)
})
test('non-zero pricing is paid', () => {
  expect(isFreeModel({ id: 'x/y', pricing: { prompt: '0.000001', completion: '0' } })).toBe(false)
})
