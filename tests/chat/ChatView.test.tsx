import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

const chat = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  useChat: vi.fn(),
}))
const fns = vi.hoisted(() => ({ fetchModels: vi.fn() }))
const db = vi.hoisted(() => ({ setChatModel: vi.fn() }))
vi.mock('../../src/chat/useChat', () => ({ useChat: chat.useChat }))
vi.mock('../../src/api/functions', () => fns)
vi.mock('../../src/api/db', () => db)

import { ChatView } from '../../src/chat/ChatView'
import { resetModelsCache } from '../../src/chat/useModels'

const base = () => ({
  messages: [], streamingText: '', streaming: false, error: null, trimmed: false, restoredDraft: null,
  send: vi.fn(), stop: vi.fn(), regenerate: vi.fn(), editLast: vi.fn(), retrySave: vi.fn(),
})
const profile = { user_id: 'u', default_model: null, system_prompt: null, theme: 'system' as const }
const models = { allowPaid: false, models: [{ id: 'a:free', name: 'A', context_length: 8192, pricing: { prompt: '0', completion: '0' }, input_modalities: ['text'] }] }

beforeEach(() => {
  resetModelsCache()
  sessionStorage.clear()
  chat.state = base()
  chat.useChat.mockImplementation(() => chat.state)
  fns.fetchModels.mockReset().mockResolvedValue(models)
  db.setChatModel.mockReset().mockResolvedValue(undefined)
})

const view = (over = {}) => render(<ChatView chatId={null} chatModel={null} profile={profile} onChatCreated={vi.fn()} {...over} />)

test('models failing to load shows the service copy and disables the composer', async () => {
  fns.fetchModels.mockRejectedValue(new TypeError('blocked'))
  view()
  expect(await screen.findByText('Model service unavailable.')).toBeInTheDocument()
  expect(screen.getByLabelText('Message')).toBeDisabled()
})

test('defaults to the first free model and passes its context length', async () => {
  view()
  await waitFor(() => expect(chat.useChat).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'a:free', contextLength: 8192 })))
})

test('trimmed shows the notice', async () => {
  chat.state = { ...base(), trimmed: true }
  view()
  expect(await screen.findByText("Older messages were trimmed to fit this model's context.")).toBeInTheDocument()
})

test('error shows Retry, which regenerates', async () => {
  chat.state = { ...base(), error: 'boom' }
  view()
  expect(await screen.findByText('boom')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(chat.state.regenerate).toHaveBeenCalled()
})

test('changing the model on an existing chat saves it', async () => {
  fns.fetchModels.mockResolvedValue({ ...models, models: [...models.models, { ...models.models[0], id: 'b:free', name: 'B' }] })
  view({ chatId: 'c1', chatModel: 'a:free' })
  await screen.findByRole('option', { name: /B ·/ })
  await userEvent.selectOptions(screen.getByLabelText('Model'), 'b:free')
  expect(db.setChatModel).toHaveBeenCalledWith('c1', 'b:free')
})

test('edit puts the last user message in the composer and resends via editLast', async () => {
  const user = { id: '1', localId: '1', chat_id: 'c1', role: 'user', content: 'old', model: 'a:free', status: 'complete', prompt_tokens: null, completion_tokens: null, created_at: '' }
  chat.state = { ...base(), messages: [user] }
  view({ chatId: 'c1', chatModel: 'a:free' })
  await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  const box = screen.getByLabelText('Message')
  expect(box).toHaveValue('old')
  await userEvent.clear(box)
  await userEvent.type(box, 'new{Enter}')
  expect(chat.state.editLast).toHaveBeenCalledWith('new')
  expect(chat.state.send).not.toHaveBeenCalled()
})
