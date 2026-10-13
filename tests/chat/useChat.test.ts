import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { Message, SSEEvent } from '../../src/lib/types'

const db = vi.hoisted(() => ({
  createChat: vi.fn(),
  listMessages: vi.fn(),
  insertMessage: vi.fn(),
  deleteMessage: vi.fn(),
  renameChat: vi.fn(),
}))
const fns = vi.hoisted(() => ({ streamChat: vi.fn() }))
vi.mock('../../src/api/db', () => db)
vi.mock('../../src/api/functions', () => fns)

import { useChat } from '../../src/chat/useChat'
import { ApiError } from '../../src/lib/errors'

let seq = 0
const saved = (m: Omit<Message, 'id' | 'created_at'>): Message => ({ ...m, id: `id${++seq}`, created_at: 'now' })

async function* events(...evs: SSEEvent[]) {
  for (const e of evs) yield e
}

const reply = (...texts: string[]) => () =>
  events(...texts.map((text) => ({ type: 'delta' as const, text })), { type: 'usage', prompt_tokens: 5, completion_tokens: 2 })

beforeEach(() => {
  seq = 0
  Object.values(db).forEach((f) => f.mockReset())
  fns.streamChat.mockReset()
  db.createChat.mockResolvedValue({ id: 'c1', title: 'New chat', model: 'm:free', created_at: '', updated_at: '' })
  db.listMessages.mockResolvedValue([])
  db.insertMessage.mockImplementation(async (m) => saved(m))
  db.deleteMessage.mockResolvedValue(undefined)
  db.renameChat.mockResolvedValue(undefined)
})

const opts = (over = {}) => ({ chatId: null, model: 'm:free', contextLength: 8192, systemPrompt: null, onChatCreated: vi.fn(), ...over })

test('happy path saves user then assistant with usage, then auto-titles', async () => {
  fns.streamChat.mockImplementationOnce(reply('Hel', 'lo')).mockImplementationOnce(reply('Greeting'))
  const o = opts()
  const { result } = renderHook(() => useChat(o))
  await act(() => result.current.send('hi'))
  expect(o.onChatCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  expect(db.insertMessage.mock.calls.map((c) => c[0])).toEqual([
    { chat_id: 'c1', role: 'user', content: 'hi', model: 'm:free', status: 'complete', prompt_tokens: null, completion_tokens: null },
    { chat_id: 'c1', role: 'assistant', content: 'Hello', model: 'm:free', status: 'complete', prompt_tokens: 5, completion_tokens: 2 },
  ])
  expect(result.current.messages.map((m) => m.content)).toEqual(['hi', 'Hello'])
  await waitFor(() => expect(db.renameChat).toHaveBeenCalledWith('c1', 'Greeting'))
})

test('system prompt is sent first', async () => {
  fns.streamChat.mockImplementation(reply('ok'))
  const { result } = renderHook(() => useChat(opts({ systemPrompt: 'be concise' })))
  await act(() => result.current.send('hi'))
  expect(fns.streamChat.mock.calls[0][1]).toEqual([{ role: 'system', content: 'be concise' }, { role: 'user', content: 'hi' }])
})

test('a second send while streaming is ignored', async () => {
  let release!: () => void
  fns.streamChat.mockImplementation(async function* () {
    await new Promise<void>((r) => (release = r))
    yield { type: 'delta', text: 'x' }
  })
  const { result } = renderHook(() => useChat(opts()))
  let first!: Promise<void>
  act(() => {
    first = result.current.send('one')
  })
  await act(() => result.current.send('two'))
  await waitFor(() => expect(release).toBeTypeOf('function'))
  await act(async () => {
    release()
    await first
  })
  expect(fns.streamChat.mock.calls.filter((c) => !c[1][0].content.startsWith('Title this'))).toHaveLength(1)
})

test('mid-stream error saves the partial reply as incomplete', async () => {
  fns.streamChat.mockImplementation(() => events({ type: 'delta', text: 'par' }, { type: 'error', message: 'boom' }))
  const { result } = renderHook(() => useChat(opts()))
  await act(() => result.current.send('hi'))
  expect(db.insertMessage).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'assistant', content: 'par', status: 'incomplete' }))
  expect(result.current.error).toBe('boom')
  expect(db.renameChat).not.toHaveBeenCalled()
})

test('429 removes the user message and restores it as a draft', async () => {
  fns.streamChat.mockImplementation(async function* () {
    throw new ApiError(429, 'upstream', 'rate limited')
  })
  const { result } = renderHook(() => useChat(opts()))
  await act(() => result.current.send('hi'))
  expect(db.deleteMessage).toHaveBeenCalledWith('id1')
  expect(result.current.messages).toEqual([])
  expect(result.current.restoredDraft).toBe('hi')
  expect(result.current.error).toBe('Free-tier limit reached — try again in a minute or switch model.')
})

test('stop saves the partial reply as incomplete without an error', async () => {
  fns.streamChat.mockImplementation(async function* (_m: string, _x: unknown, signal: AbortSignal) {
    yield { type: 'delta', text: 'part' }
    await new Promise((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
  })
  const { result } = renderHook(() => useChat(opts()))
  let p!: Promise<void>
  act(() => {
    p = result.current.send('hi')
  })
  await waitFor(() => expect(result.current.streamingText).toBe('part'))
  await act(async () => {
    result.current.stop()
    await p
  })
  expect(db.insertMessage).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'part', status: 'incomplete' }))
  expect(result.current.error).toBeNull()
})

test('failed save is flagged and retrySave re-inserts', async () => {
  fns.streamChat.mockImplementation(reply('ok'))
  db.insertMessage.mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(() => useChat(opts()))
  await act(() => result.current.send('hi'))
  const failed = result.current.messages[0]
  expect(failed.saveFailed).toBe(true)
  await act(() => result.current.retrySave(failed.localId))
  expect(result.current.messages[0].saveFailed).toBeFalsy()
  expect(db.insertMessage).toHaveBeenCalledTimes(3)
})

test('tiny context reports trimmed', async () => {
  fns.streamChat.mockImplementation(reply('ok'))
  db.listMessages.mockResolvedValue([saved({ chat_id: 'c1', role: 'user', content: 'x'.repeat(400), model: 'm', status: 'complete', prompt_tokens: null, completion_tokens: null })])
  const { result } = renderHook(() => useChat(opts({ chatId: 'c1', contextLength: 100 })))
  await waitFor(() => expect(result.current.messages).toHaveLength(1))
  await act(() => result.current.send('hi'))
  expect(result.current.trimmed).toBe(true)
})

test('regenerate deletes the last reply and streams again', async () => {
  fns.streamChat.mockImplementation(reply('again'))
  const u = saved({ chat_id: 'c1', role: 'user', content: 'hi', model: 'm', status: 'complete', prompt_tokens: null, completion_tokens: null })
  const a = saved({ chat_id: 'c1', role: 'assistant', content: 'old', model: 'm', status: 'complete', prompt_tokens: 1, completion_tokens: 1 })
  db.listMessages.mockResolvedValue([u, a])
  const { result } = renderHook(() => useChat(opts({ chatId: 'c1' })))
  await waitFor(() => expect(result.current.messages).toHaveLength(2))
  await act(() => result.current.regenerate())
  expect(db.deleteMessage).toHaveBeenCalledWith(a.id)
  expect(fns.streamChat.mock.calls[0][1]).toEqual([{ role: 'user', content: 'hi' }])
  expect(result.current.messages.map((m) => m.content)).toEqual(['hi', 'again'])
})

test('regenerate after an error with no reply re-streams the last user message', async () => {
  fns.streamChat.mockImplementation(reply('ok'))
  db.listMessages.mockResolvedValue([saved({ chat_id: 'c1', role: 'user', content: 'hi', model: 'm', status: 'complete', prompt_tokens: null, completion_tokens: null })])
  const { result } = renderHook(() => useChat(opts({ chatId: 'c1' })))
  await waitFor(() => expect(result.current.messages).toHaveLength(1))
  await act(() => result.current.regenerate())
  expect(db.deleteMessage).not.toHaveBeenCalled()
  expect(result.current.messages.map((m) => m.content)).toEqual(['hi', 'ok'])
})

test('editLast deletes the last user message and its reply, then resends', async () => {
  fns.streamChat.mockImplementation(reply('new'))
  const u = saved({ chat_id: 'c1', role: 'user', content: 'hi', model: 'm', status: 'complete', prompt_tokens: null, completion_tokens: null })
  const a = saved({ chat_id: 'c1', role: 'assistant', content: 'old', model: 'm', status: 'complete', prompt_tokens: 1, completion_tokens: 1 })
  db.listMessages.mockResolvedValue([u, a])
  const { result } = renderHook(() => useChat(opts({ chatId: 'c1' })))
  await waitFor(() => expect(result.current.messages).toHaveLength(2))
  await act(() => result.current.editLast('hello'))
  expect(db.deleteMessage).toHaveBeenCalledWith(u.id)
  expect(db.deleteMessage).toHaveBeenCalledWith(a.id)
  expect(result.current.messages.map((m) => m.content)).toEqual(['hello', 'new'])
})

test('switching chats mid-stream aborts and keeps the reply out of the new chat', async () => {
  fns.streamChat.mockImplementation(async function* (_m: string, _x: unknown, signal: AbortSignal) {
    yield { type: 'delta', text: 'part' }
    await new Promise((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
  })
  const other = saved({ chat_id: 'c2', role: 'user', content: 'other chat', model: 'm', status: 'complete', prompt_tokens: null, completion_tokens: null })
  db.listMessages.mockImplementation(async (id: string) => (id === 'c2' ? [other] : []))
  const { result, rerender } = renderHook((o) => useChat(o), { initialProps: opts({ chatId: 'c1' }) })
  let p!: Promise<void>
  act(() => {
    p = result.current.send('hi')
  })
  await waitFor(() => expect(result.current.streamingText).toBe('part'))
  rerender(opts({ chatId: 'c2' }))
  await act(() => p)
  expect(db.insertMessage).toHaveBeenLastCalledWith(expect.objectContaining({ chat_id: 'c1', content: 'part', status: 'incomplete' }))
  await waitFor(() => expect(result.current.messages.map((m) => m.content)).toEqual(['other chat']))
  expect(result.current.streaming).toBe(false)
})

test('returning to a chat created this session reloads its messages', async () => {
  fns.streamChat.mockImplementation(reply('ok'))
  const a1 = saved({ chat_id: 'c1', role: 'user', content: 'in A', model: 'm', status: 'complete', prompt_tokens: null, completion_tokens: null })
  const b1 = saved({ chat_id: 'c2', role: 'user', content: 'in B', model: 'm', status: 'complete', prompt_tokens: null, completion_tokens: null })
  const { result, rerender } = renderHook((o) => useChat(o), { initialProps: opts() })
  await act(() => result.current.send('hi')) // creates c1
  rerender(opts({ chatId: 'c1' }))
  db.listMessages.mockImplementation(async (id: string) => (id === 'c1' ? [a1] : [b1]))
  rerender(opts({ chatId: null }))
  rerender(opts({ chatId: 'c2' }))
  await waitFor(() => expect(result.current.messages.map((m) => m.content)).toEqual(['in B']))
  rerender(opts({ chatId: 'c1' }))
  await waitFor(() => expect(result.current.messages.map((m) => m.content)).toEqual(['in A']))
})

test('switching chats right after saving the user message does not stream into the new chat', async () => {
  fns.streamChat.mockImplementation(reply('ok'))
  let releaseSave!: () => void
  db.insertMessage.mockImplementationOnce((m) => new Promise((r) => (releaseSave = () => r(saved(m)))))
  db.listMessages.mockResolvedValue([])
  const { result, rerender } = renderHook((o) => useChat(o), { initialProps: opts({ chatId: 'c1' }) })
  let p!: Promise<void>
  act(() => {
    p = result.current.send('hi')
  })
  await waitFor(() => expect(releaseSave).toBeTypeOf('function'))
  rerender(opts({ chatId: 'c2' }))
  await act(async () => {
    releaseSave()
    await p
  })
  expect(fns.streamChat).not.toHaveBeenCalled()
  expect(result.current.messages).toEqual([])
})

test('a failed delete during regenerate surfaces an error', async () => {
  const a = saved({ chat_id: 'c1', role: 'assistant', content: 'old', model: 'm', status: 'complete', prompt_tokens: 1, completion_tokens: 1 })
  db.listMessages.mockResolvedValue([a])
  db.deleteMessage.mockRejectedValue(new Error('offline'))
  const { result } = renderHook(() => useChat(opts({ chatId: 'c1' })))
  await waitFor(() => expect(result.current.messages).toHaveLength(1))
  await act(() => result.current.regenerate())
  expect(result.current.error).toBe('offline')
  expect(result.current.streaming).toBe(false)
})

test('a failed retrySave surfaces an error', async () => {
  fns.streamChat.mockImplementation(reply('ok'))
  db.insertMessage.mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(() => useChat(opts()))
  await act(() => result.current.send('hi'))
  db.insertMessage.mockRejectedValueOnce(new Error('still offline'))
  await act(() => result.current.retrySave(result.current.messages[0].localId))
  expect(result.current.error).toBe('still offline')
  expect(result.current.messages[0].saveFailed).toBe(true)
})
