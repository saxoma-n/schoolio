export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export const preflight = () => new Response('ok', { headers: corsHeaders })

export function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: corsHeaders })
}

export const unavailable = () => errorResponse(503, 'unavailable', 'Model service unavailable.')
