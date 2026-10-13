import { defineConfig, devices } from '@playwright/test'

// Expects a running local Supabase (`npx supabase start`) with functions served using
// supabase/functions/.env.test, and VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY exported.
export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: [
    { command: 'node e2e/mock-openrouter.mjs', port: 4010, reuseExistingServer: true },
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173/schoolio/', reuseExistingServer: true },
  ],
})
