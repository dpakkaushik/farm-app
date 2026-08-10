import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.js so the production build config stays
// untouched — Vercel builds on every push, and a test setting has no business
// being able to break a deploy.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
