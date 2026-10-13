import { useState } from 'react'
import { isFreeModel } from '../../supabase/functions/_shared/free.ts'
import { ModelPicker } from '../chat/ModelPicker'
import type { ModelInfo, Profile } from '../lib/types'

type Patch = Partial<Omit<Profile, 'user_id'>>

export function applyTheme(theme: Profile['theme']) {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

export function Settings({ profile, models, allowPaid, onSave }: { profile: Profile; models: ModelInfo[]; allowPaid: boolean; onSave(patch: Patch): Promise<void> }) {
  const [defaultModel, setDefaultModel] = useState(profile.default_model ?? models.find(isFreeModel)?.id ?? '')
  const [systemPrompt, setSystemPrompt] = useState(profile.system_prompt ?? '')
  const [theme, setTheme] = useState(profile.theme)
  const [status, setStatus] = useState<string | null>(null)

  const save = async () => {
    setStatus(null)
    try {
      await onSave({ default_model: defaultModel || null, system_prompt: systemPrompt.trim() || null, theme })
      setStatus('Saved.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not save.')
    }
  }

  return (
    <form className="settings" onSubmit={(e) => (e.preventDefault(), save())}>
      <h1>Settings</h1>
      <div>
        <h2>Default model</h2>
        <ModelPicker value={defaultModel} onChange={setDefaultModel} models={models} allowPaid={allowPaid} />
      </div>
      <label>
        System prompt
        <textarea value={systemPrompt} placeholder="e.g. Be concise." onChange={(e) => setSystemPrompt(e.target.value)} />
      </label>
      <label>
        Theme
        <select value={theme} onChange={(e) => setTheme(e.target.value as Profile['theme'])}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <div>
        <button type="submit">Save</button> {status && <span role="status">{status}</span>}
      </div>
    </form>
  )
}
