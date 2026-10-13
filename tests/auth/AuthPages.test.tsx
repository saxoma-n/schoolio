import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('../../src/lib/supabase', () => ({ supabase: { auth } }))

import { Login, ResetPassword, Signup, UpdatePassword } from '../../src/auth/AuthPages'

const ui = (el: React.ReactNode) => render(<MemoryRouter>{el}</MemoryRouter>)
beforeEach(() => Object.values(auth).forEach((f) => f.mockReset()))

test('signup trims and lower-cases the email', async () => {
  auth.signUp.mockResolvedValue({ error: null })
  ui(<Signup />)
  await userEvent.type(screen.getByLabelText('Email'), '  Friend@X.com ')
  await userEvent.type(screen.getByLabelText('Password'), 'password123')
  await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))
  expect(auth.signUp).toHaveBeenCalledWith({ email: 'friend@x.com', password: 'password123' })
})

test('signup blocked by the allowlist shows the invite copy', async () => {
  auth.signUp.mockResolvedValue({ error: { message: 'Database error saving new user' } })
  ui(<Signup />)
  await userEvent.type(screen.getByLabelText('Email'), 'x@y.com')
  await userEvent.type(screen.getByLabelText('Password'), 'password123')
  await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))
  expect(await screen.findByText("This email isn't invited.")).toBeInTheDocument()
})

test('login submits credentials', async () => {
  auth.signInWithPassword.mockResolvedValue({ error: null })
  ui(<Login />)
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
  await userEvent.type(screen.getByLabelText('Password'), 'pw')
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' })
})

test('login shows the error message', async () => {
  auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
  ui(<Login />)
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
  await userEvent.type(screen.getByLabelText('Password'), 'bad')
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
  expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument()
})

test('reset sends the email with a redirect to the app root', async () => {
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  ui(<ResetPassword />)
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.com')
  await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', { redirectTo: location.origin + import.meta.env.BASE_URL })
  expect(await screen.findByText('Check your email for a reset link.')).toBeInTheDocument()
})

test('update password calls updateUser', async () => {
  auth.updateUser.mockResolvedValue({ error: null })
  ui(<UpdatePassword />)
  await userEvent.type(screen.getByLabelText('New password'), 'newpass123')
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }))
  expect(auth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' })
})
