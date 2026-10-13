import type { ChatMessage } from './types'

const tokens = (m: ChatMessage) => Math.ceil(m.content.length / 4)

// Keeps every system message and the newest message; drops oldest others until under budget.
export function trimContext(messages: ChatMessage[], contextLength: number): { messages: ChatMessage[]; trimmed: boolean } {
  const budget = contextLength - Math.min(4096, Math.floor(contextLength * 0.25))
  const kept = [...messages]
  let total = kept.reduce((n, m) => n + tokens(m), 0)
  let trimmed = false
  while (total > budget) {
    const i = kept.findIndex((m, idx) => m.role !== 'system' && idx < kept.length - 1)
    if (i === -1) break
    total -= tokens(kept[i])
    kept.splice(i, 1)
    trimmed = true
  }
  return { messages: trimmed ? kept : messages, trimmed }
}
