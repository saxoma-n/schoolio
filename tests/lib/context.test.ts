import { expect, test } from 'vitest'
import { trimContext } from '../../src/lib/context'
import type { ChatMessage } from '../../src/lib/types'

const m = (role: ChatMessage['role'], n: number, tag = ''): ChatMessage => ({ role, content: tag + 'x'.repeat(n - tag.length) })

test('drops oldest non-system messages until under budget', () => {
  // contextLength 1000 → budget 750 tokens; total here is 1025
  const system = m('system', 400)
  const [a, b, c] = [m('user', 1200, 'a'), m('assistant', 1200, 'b'), m('user', 1200, 'c')]
  const newest = m('user', 100, 'n')
  const out = trimContext([system, a, b, c, newest], 1000)
  expect(out).toEqual({ messages: [system, b, c, newest], trimmed: true })
})

test('returns everything untouched when it fits', () => {
  const msgs = [m('system', 40), m('user', 40), m('assistant', 40), m('user', 40)]
  expect(trimContext(msgs, 1000)).toEqual({ messages: msgs, trimmed: false })
})

test('keeps the newest user message even when it alone exceeds the budget', () => {
  const system = m('system', 40)
  const newest = m('user', 10_000)
  const out = trimContext([system, m('user', 40), m('assistant', 40), newest], 1000)
  expect(out).toEqual({ messages: [system, newest], trimmed: true })
})

test('reserve is capped at 4096 tokens for large contexts', () => {
  // 100k context → budget 95 904 tokens ≈ 383 616 chars
  const msgs = [m('user', 380_000), m('user', 100)]
  expect(trimContext(msgs, 100_000).trimmed).toBe(false)
})
