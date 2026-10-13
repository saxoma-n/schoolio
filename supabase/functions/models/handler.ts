import { corsHeaders, preflight, unavailable } from '../_shared/cors.ts'
import { allowPaid, baseUrl, type Env } from '../_shared/env.ts'

type UpstreamModel = {
  id: string
  name: string
  context_length: number
  pricing: { prompt: string; completion: string }
  architecture?: { input_modalities?: string[] }
}

export async function handleModels(req: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight()
  if (!env.OPENROUTER_API_KEY) return unavailable()
  try {
    const res = await fetchFn(`${baseUrl(env)}/models`)
    if (!res.ok) return unavailable()
    const { data } = (await res.json()) as { data: UpstreamModel[] }
    const models = data.map((m) => ({
      id: m.id,
      name: m.name,
      context_length: m.context_length,
      pricing: { prompt: m.pricing.prompt, completion: m.pricing.completion },
      input_modalities: m.architecture?.input_modalities ?? ['text'],
    }))
    return Response.json(
      { allowPaid: allowPaid(env), models },
      { headers: { ...corsHeaders, 'Cache-Control': 'max-age=3600' } },
    )
  } catch {
    return unavailable()
  }
}
