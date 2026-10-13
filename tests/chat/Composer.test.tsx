import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { Composer } from '../../src/chat/Composer'

const props = (over = {}) => ({ chatKey: 'new', disabled: false, streaming: false, restoredDraft: null, onSend: vi.fn(), onStop: vi.fn(), ...over })
beforeEach(() => sessionStorage.clear())

test('Enter sends and clears; Shift+Enter adds a newline', async () => {
  const p = props()
  render(<Composer {...p} />)
  const box = screen.getByLabelText('Message')
  await userEvent.type(box, 'a{Shift>}{Enter}{/Shift}b{Enter}')
  expect(p.onSend).toHaveBeenCalledWith('a\nb')
  expect(box).toHaveValue('')
})

test('while streaming, send is disabled and Stop is shown', async () => {
  const p = props({ streaming: true })
  render(<Composer {...p} />)
  await userEvent.type(screen.getByLabelText('Message'), 'hi{Enter}')
  expect(p.onSend).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect(p.onStop).toHaveBeenCalled()
})

test('empty or whitespace input does not send', async () => {
  const p = props()
  render(<Composer {...p} />)
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Message'), '   {Enter}')
  expect(p.onSend).not.toHaveBeenCalled()
})

test('draft survives remount', async () => {
  const { unmount } = render(<Composer {...props()} />)
  await userEvent.type(screen.getByLabelText('Message'), 'draft')
  unmount()
  render(<Composer {...props()} />)
  expect(screen.getByLabelText('Message')).toHaveValue('draft')
})

test('restoredDraft fills the box', () => {
  render(<Composer {...props({ restoredDraft: 'hi' })} />)
  expect(screen.getByLabelText('Message')).toHaveValue('hi')
})
