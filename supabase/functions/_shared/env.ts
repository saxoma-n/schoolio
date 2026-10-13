export type Env = {
  OPENROUTER_API_KEY?: string
  OPENROUTER_BASE_URL?: string
  ALLOW_PAID_MODELS?: string
}

export const baseUrl = (env: Env) => env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
export const allowPaid = (env: Env) => env.ALLOW_PAID_MODELS === 'true'
