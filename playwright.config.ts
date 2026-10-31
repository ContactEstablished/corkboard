import { defineConfig } from '@playwright/test'

// 12" 2K-class landscape tablet ≈ 1280×800 CSS px (16:10).
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1280, height: 800 }, hasTouch: true },
  webServer: { command: 'node scripts/serve.mjs', url: 'http://localhost:5173', reuseExistingServer: true },
})
