import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Separate Vitest config: leaves your existing Vite dev-server/proxy config unchanged.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/test/**/*.test.tsx'],
    restoreMocks: true,
    clearMocks: true,
  },
})
