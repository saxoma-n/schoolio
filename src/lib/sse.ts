import type { SSEEvent } from './types'

export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n') // CRLF may straddle chunks
    const frames = buffer.split('\n\n')
    buffer = done ? '' : frames.pop()!
    for (const frame of frames) yield* parseFrame(frame)
    if (done) return
  }
}

function* parseFrame(frame: string): Generator<SSEEvent> {
  for (const line of frame.split('\n')) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') continue
    const json = JSON.parse(data)
    if (json.error) yield { type: 'error', message: json.error.message ?? 'Stream error' }
    const text = json.choices?.[0]?.delta?.content
    if (text) yield { type: 'delta', text }
    if (json.usage) yield { type: 'usage', prompt_tokens: json.usage.prompt_tokens, completion_tokens: json.usage.completion_tokens }
  }
}
