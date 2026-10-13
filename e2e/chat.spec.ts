import { expect, test } from '@playwright/test'

test('chat function rejects requests without a login', async ({ request }) => {
  const res = await request.post(`${process.env.VITE_SUPABASE_URL}/functions/v1/chat`, { data: { model: 'mock/model:free', messages: [] } })
  expect(res.status()).toBe(401)
})

test('sign up, chat with a streamed reply, and find it again after reload', async ({ page }) => {
  await page.goto('/schoolio/#/signup')
  await page.getByLabel('Email').fill('e2e@example.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Sign up' }).click()

  const box = page.getByLabel('Message')
  await expect(box).toBeEnabled()
  await box.fill('hi')
  await box.press('Enter')
  await expect(page.locator('article.assistant').getByText('Hello from mock')).toBeVisible()

  await page.reload()
  await page.getByRole('navigation', { name: 'Chats' }).locator('li button.title').first().click()
  await expect(page.locator('article.user').getByText('hi')).toBeVisible()
  await expect(page.locator('article.assistant').getByText('Hello from mock')).toBeVisible()
})
