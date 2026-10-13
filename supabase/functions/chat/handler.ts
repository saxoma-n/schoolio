import { corsHeaders, errorResponse, preflight, unavailable } from '../_shared/cors.ts'
import { allowPaid, baseUrl, type Env } from '../_shared/env.ts'
import { isFreeModel } from '../_shared/free.ts'
import { rejectUnlessUser } from '../_shared/auth.ts'

type Body = { model?: unknown; messages?: unknown }

export async function handleChat(req: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight()
  const denied = await rejectUnlessUser(req, env, fetchFn)
  if (denied) return denied
  const key = env.OPENROUTER_API_KEY
  if (!key) return unavailable()

  let body: Body
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'bad_request', 'Invalid JSON body.')
  }
  const { model, messages } = body
  if (typeof model !== 'string' || !model || !Array.isArray(messages)) {
    return errorResponse(400, 'bad_request', 'model and messages are required.')
  }

  try {
    if (!allowPaid(env) && !model.endsWith(':free')) {
      const list = await fetchFn(`${baseUrl(env)}/models`)
      const { data } = (await list.json()) as { data: { id: string; pricing?: { prompt: string; completion: string } }[] }
      const entry = data.find((m) => m.id === model)
      if (!entry || !isFreeModel(entry)) return errorResponse(400, 'paid_model', 'Only free models are enabled.')
    }

    const upstream = await fetchFn(`${baseUrl(env)}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/schoolio',
        'X-Title': 'Schoolio',
      },
      body: JSON.stringify({ model, messages, stream: true, usage: { include: true } }),
    })

    if (!upstream.ok) {
      const text = await upstream.text()
      let message = `Upstream error ${upstream.status}`
      try {
        message = JSON.parse(text).error?.message ?? message
      } catch { /* non-JSON upstream body */ }
      return errorResponse(upstream.status, 'upstream', message.replaceAll(key, '[redacted]'))
    }

    return new Response(upstream.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  } catch {
    return unavailable()
  }
}
