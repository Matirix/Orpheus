import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // jsdom only exposes localStorage for a non-opaque origin
    environmentOptions: { jsdom: { url: 'http://localhost:5173' } },
    setupFiles: './test.setup.ts',
  },
})
