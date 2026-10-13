import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Settings, applyTheme } from '../../src/settings/Settings'
import type { ModelInfo } from '../../src/lib/types'

const models: ModelInfo[] = [
  { id: 'a:free', name: 'A', context_length: 8192, pricing: { prompt: '0', completion: '0' }, input_modalities: ['text'] },
  { id: 'b:free', name: 'B', context_length: 8192, pricing: { prompt: '0', completion: '0' }, input_modalities: ['text'] },
]
const profile = { user_id: 'u', default_model: 'b:free', system_prompt: null, theme: 'system' as const }

test('saves default model, system prompt and theme', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<Settings profile={profile} models={models} allowPaid={false} onSave={onSave} />)
  await userEvent.type(screen.getByLabelText('System prompt'), 'be concise')
  await userEvent.selectOptions(screen.getByLabelText('Theme'), 'dark')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(onSave).toHaveBeenCalledWith({ system_prompt: 'be concise', theme: 'dark', default_model: 'b:free' })
  expect(await screen.findByText('Saved.')).toBeInTheDocument()
})

test('applyTheme sets or clears data-theme', () => {
  applyTheme('dark')
  expect(document.documentElement.dataset.theme).toBe('dark')
  applyTheme('system')
  expect(document.documentElement.dataset.theme).toBeUndefined()
})
