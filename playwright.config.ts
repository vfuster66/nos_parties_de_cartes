import { defineConfig, devices } from '@playwright/test'

// Parcours à quatre contextes de navigateur indépendants, largeur de téléphone.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  expect: { timeout: 8000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5199',
    actionTimeout: 8000,
    ...devices['Pixel 5'],
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'phone-chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npx tsx e2e/server.ts',
      url: 'http://127.0.0.1:3101/healthz',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5199 --strictPort',
      url: 'http://127.0.0.1:5199/',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_ONLINE_SERVER_URL: 'same-origin', ONLINE_SERVER_TARGET: 'http://127.0.0.1:3101' },
    },
  ],
})
