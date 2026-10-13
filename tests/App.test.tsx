import { act, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

type Listener = (event: string, session: unknown) => void
const state = vi.hoisted(() => ({ session: null as unknown, listener: null as null | ((e: string, s: unknown) => void) }))
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.session } })),
      onAuthStateChange: vi.fn((cb: Listener) => {
        state.listener = cb
        return { data: { subscription: { unsubscribe() {} } } }
      }),
    },
  },
}))
// The signed-in shell is covered elsewhere; keep it inert here.
vi.mock('../src/Shell', () => ({ default: () => <h1>Signed in</h1> }))

import App from '../src/App'

beforeEach(() => {
  state.session = null
  location.hash = ''
})

test('unauthenticated visit to the app root shows the login page', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
})

test('signing out while on a chat route redirects to login', async () => {
  state.session = { access_token: 't' }
  location.hash = '#/c/123'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Signed in' })).toBeInTheDocument()
  act(() => state.listener!('SIGNED_OUT', null))
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
})

test('password recovery event opens the update-password page', async () => {
  render(<App />)
  await screen.findByRole('heading', { name: 'Log in' })
  act(() => state.listener!('PASSWORD_RECOVERY', { access_token: 't' }))
  expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument()
})
