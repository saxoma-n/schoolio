import { useEffect, useState } from 'react'
import { fetchModels } from '../api/functions'
import { errorMessage } from '../lib/errors'
import type { ModelInfo } from '../lib/types'

type Models = { allowPaid: boolean; models: ModelInfo[] }

// One fetch per page load, shared by ChatView and Settings.
let cache: Promise<Models> | null = null
export const resetModelsCache = () => {
  cache = null
}

export function useModels(): { data: Models | null; error: string | null } {
  const [data, setData] = useState<Models | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    cache ??= fetchModels()
    cache.then(
      (d) => live && setData(d),
      (e) => {
        cache = null
        if (live) setError(errorMessage(e))
      },
    )
    return () => {
      live = false
    }
  }, [])
  return { data, error }
}
