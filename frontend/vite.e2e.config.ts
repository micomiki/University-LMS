import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separate from the normal Vite configuration: proxy only to isolated E2E FastAPI.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:18000' },
  },
})
