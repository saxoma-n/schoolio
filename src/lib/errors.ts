export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Free-tier limit reached — try again in a minute or switch model.'
    if (err.code === 'paid_model') return 'Only free models are enabled.'
    if (err.code === 'unavailable') return 'Model service unavailable.'
    return err.message
  }
  if (err instanceof TypeError) return 'Model service unavailable.'
  return err instanceof Error ? err.message : String(err)
}
