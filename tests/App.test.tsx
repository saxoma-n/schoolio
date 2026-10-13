import { render, screen } from '@testing-library/react'
import { vi, test, expect } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
  },
}))

import App from '../src/App'

test('unauthenticated visitor sees the login page', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
})
