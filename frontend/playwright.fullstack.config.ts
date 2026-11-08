import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = path.dirname(fileURLToPath(import.meta.url))

// Test-only credentials and ports. Do not use this config against a deployed LMS.
const testDatabaseUrl =
  'postgresql+psycopg://lms_e2e:local_e2e_only@127.0.0.1:55433/university_lms_e2e'

export default defineConfig({
  testDir: './e2e-fullstack',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:15173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'python -m uvicorn app.main:app --host 127.0.0.1 --port 18000',
      cwd: path.resolve(configDir, '../backend'),
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        SECRET_KEY: 'e2e-local-test-only-secret-never-use-in-production',
      },
      url: 'http://127.0.0.1:18000/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --config vite.e2e.config.ts --host 127.0.0.1 --port 15173 --strictPort',
      cwd: configDir,
      url: 'http://127.0.0.1:15173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
