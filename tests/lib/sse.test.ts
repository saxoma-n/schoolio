import { expect, test } from 'vitest'
import { parseSSE } from '../../src/lib/sse'

function streamOf(chunks: string[]) {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((s) => c.enqueue(enc.encode(s)))
      c.close()
    },
  })
}

async function collect(chunks: string[]) {
  const out = []
  for await (const e of parseSSE(streamOf(chunks))) out.push(e)
  return out
}

test('buffers frames split across reads, skips comments and [DONE], yields usage', async () => {
  const events = await collect([
    'data: {"choices":[{"delta":{"content":"He',
    'l"}}]}\n\n: OPENROUTER PROCESSING\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
    'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
  ])
  expect(events).toEqual([
    { type: 'delta', text: 'Hel' },
    { type: 'delta', text: 'lo' },
    { type: 'usage', prompt_tokens: 5, completion_tokens: 2 },
  ])
})

test('mid-stream error frame yields an error event', async () => {
  const events = await collect(['data: {"choices":[{"delta":{"content":"a"}}]}\n\n', 'data: {"error":{"message":"boom"}}\n\n'])
  expect(events).toEqual([{ type: 'delta', text: 'a' }, { type: 'error', message: 'boom' }])
})

test('handles CRLF line endings', async () => {
  const events = await collect(['data: {"choices":[{"delta":{"content":"a"}}]}\r\n\r\n'])
  expect(events).toEqual([{ type: 'delta', text: 'a' }])
})
