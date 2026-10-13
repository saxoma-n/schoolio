export function isFreeModel(m: { id: string; pricing?: { prompt: string; completion: string } }): boolean {
  return m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0')
}
