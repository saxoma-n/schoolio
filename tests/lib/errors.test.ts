import { expect, test } from 'vitest'
import { ApiError, errorMessage } from '../../src/lib/errors'

test('429 maps to the free-tier copy', () => {
  expect(errorMessage(new ApiError(429, 'upstream', 'Rate limited'))).toBe('Free-tier limit reached — try again in a minute or switch model.')
})
test('paid_model maps to the free-only copy', () => {
  expect(errorMessage(new ApiError(400, 'paid_model', 'x'))).toBe('Only free models are enabled.')
})
test('unavailable maps to the service copy', () => {
  expect(errorMessage(new ApiError(503, 'unavailable', 'x'))).toBe('Model service unavailable.')
})
test('other ApiError shows its message', () => {
  expect(errorMessage(new ApiError(502, 'upstream', 'Provider returned error'))).toBe('Provider returned error')
})
test('network TypeError maps to the service copy', () => {
  expect(errorMessage(new TypeError('Failed to fetch'))).toBe('Model service unavailable.')
})
