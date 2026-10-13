import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ModelPicker } from '../../src/chat/ModelPicker'
import type { ModelInfo } from '../../src/lib/types'

const model = (id: string, name: string, paid = false): ModelInfo => ({
  id, name, context_length: 131072, pricing: paid ? { prompt: '0.1', completion: '0.1' } : { prompt: '0', completion: '0' }, input_modalities: ['text'],
})
const models = [model('meta/llama:free', 'Llama'), model('qwen/qwen:free', 'Qwen'), model('openai/gpt', 'GPT', true)]
const options = () => within(screen.getByLabelText('Model')).getAllByRole('option').map((o) => o.textContent)

test('search filters by id or name, case-insensitive', async () => {
  render(<ModelPicker value="qwen/qwen:free" onChange={vi.fn()} models={models} allowPaid={false} />)
  await userEvent.type(screen.getByLabelText('Search models'), 'LLAMA')
  expect(options()).toEqual(['Qwen · 131k context', 'Llama · 131k context'])
})

test('paid models are hidden without allowPaid and there is no toggle', () => {
  render(<ModelPicker value="meta/llama:free" onChange={vi.fn()} models={models} allowPaid={false} />)
  expect(options()).not.toContain('GPT · 131k context')
  expect(screen.queryByLabelText('Show paid')).toBeNull()
})

test('Show paid reveals paid models when allowed', async () => {
  render(<ModelPicker value="meta/llama:free" onChange={vi.fn()} models={models} allowPaid />)
  await userEvent.click(screen.getByLabelText('Show paid'))
  expect(options()).toContain('GPT · 131k context')
})

test('a stored model missing from the list still shows as selected', () => {
  render(<ModelPicker value="gone/model:free" onChange={vi.fn()} models={models} allowPaid={false} />)
  expect(screen.getByLabelText('Model')).toHaveValue('gone/model:free')
})

test('choosing a model calls onChange', async () => {
  const onChange = vi.fn()
  render(<ModelPicker value="meta/llama:free" onChange={onChange} models={models} allowPaid={false} />)
  await userEvent.selectOptions(screen.getByLabelText('Model'), 'qwen/qwen:free')
  expect(onChange).toHaveBeenCalledWith('qwen/qwen:free')
})
