import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { Sidebar } from '../../src/sidebar/Sidebar'
import type { Chat } from '../../src/lib/types'

const chat = (id: string, title: string): Chat => ({ id, title, model: 'm', created_at: '', updated_at: '' })
const chats = [chat('1', 'Math homework'), chat('2', 'Essay ideas'), chat('3', 'More MATH')]
const props = () => ({ chats, activeId: null, onNew: vi.fn(), onSelect: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(), onSignOut: vi.fn() })
afterEach(() => vi.restoreAllMocks())

test('search filters by title, case-insensitive', async () => {
  render(<Sidebar {...props()} />)
  await userEvent.type(screen.getByLabelText('Search chats'), 'math')
  expect(screen.getByText('Math homework')).toBeInTheDocument()
  expect(screen.getByText('More MATH')).toBeInTheDocument()
  expect(screen.queryByText('Essay ideas')).toBeNull()
})

test('selecting a chat calls onSelect', async () => {
  const p = props()
  render(<Sidebar {...p} />)
  await userEvent.click(screen.getByText('Essay ideas'))
  expect(p.onSelect).toHaveBeenCalledWith('2')
})

test('rename: Enter saves, empty is rejected, Escape cancels', async () => {
  const p = props()
  render(<Sidebar {...p} />)
  await userEvent.click(screen.getByRole('button', { name: 'Rename Math homework' }))
  const box = screen.getByLabelText('Chat title')
  await userEvent.clear(box)
  await userEvent.type(box, '   {Enter}')
  expect(p.onRename).not.toHaveBeenCalled()
  await userEvent.type(box, 'New{Enter}')
  expect(p.onRename).toHaveBeenCalledWith('1', 'New')

  await userEvent.click(screen.getByRole('button', { name: 'Rename Essay ideas' }))
  await userEvent.type(screen.getByLabelText('Chat title'), 'x{Escape}')
  expect(p.onRename).toHaveBeenCalledTimes(1)
  expect(screen.queryByLabelText('Chat title')).toBeNull()
})

test('delete asks for confirmation', async () => {
  const p = props()
  render(<Sidebar {...p} />)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  const del = screen.getByRole('button', { name: 'Delete Essay ideas' })
  await userEvent.click(del)
  expect(p.onDelete).not.toHaveBeenCalled()
  await userEvent.click(del)
  expect(p.onDelete).toHaveBeenCalledWith('2')
  expect(confirm).toHaveBeenCalledTimes(2)
})

test('new chat and sign out buttons', async () => {
  const p = props()
  render(<Sidebar {...p} />)
  await userEvent.click(screen.getByRole('button', { name: 'New chat' }))
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(p.onNew).toHaveBeenCalled()
  expect(p.onSignOut).toHaveBeenCalled()
})
