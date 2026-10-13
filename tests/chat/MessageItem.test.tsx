import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { MessageItem } from '../../src/chat/MessageItem'
import type { UiMessage } from '../../src/chat/useChat'

const msg = (over: Partial<UiMessage> = {}): UiMessage => ({
  id: '1', localId: '1', chat_id: 'c', role: 'assistant', content: 'hi', model: 'm', status: 'complete',
  prompt_tokens: null, completion_tokens: null, created_at: '', ...over,
})

test('renders markdown', () => {
  render(<MessageItem message={msg({ content: 'some **bold** text' })} />)
  expect(screen.getByText('bold').tagName).toBe('STRONG')
})

test('code blocks have a copy button that copies the code', async () => {
  const user = userEvent.setup()
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  render(<MessageItem message={msg({ content: '```js\nconst a = 1\n```' })} />)
  await user.click(screen.getByRole('button', { name: 'Copy' }))
  expect(writeText).toHaveBeenCalledWith('const a = 1\n')
})

test('incomplete replies are labelled', () => {
  render(<MessageItem message={msg({ status: 'incomplete' })} />)
  expect(screen.getByText('Incomplete')).toBeInTheDocument()
})

test('unsaved messages offer a retry', async () => {
  const onRetrySave = vi.fn()
  render(<MessageItem message={msg({ saveFailed: true })} onRetrySave={onRetrySave} />)
  await userEvent.click(screen.getByRole('button', { name: 'Not saved — retry' }))
  expect(onRetrySave).toHaveBeenCalled()
})
