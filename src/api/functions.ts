import { ApiError } from '../lib/errors'
import { parseSSE } from '../lib/sse'
import { supabase } from '../lib/supabase'
import type { ChatMessage, ModelInfo, SSEEvent } from '../lib/types'

async function call(name: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    ...init,
    signal,
    headers: {
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error?.code ?? 'http', body?.error?.message ?? body?.msg ?? `Request failed (${res.status})`)
  }
  return res
}

export async function fetchModels(): Promise<{ allowPaid: boolean; models: ModelInfo[] }> {
  return (await call('models')).json()
}

export async function* streamChat(model: string, messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const res = await call('chat', { method: 'POST', body: JSON.stringify({ model, messages }) }, signal)
  yield* parseSSE(res.body!)
}
