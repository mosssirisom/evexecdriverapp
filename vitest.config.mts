import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    // Pure logic and server code run in Node; a test that needs a browser says so
    // with `// @vitest-environment jsdom` at the top of its file.
    environment: 'node',
    include: ['lib/**/*.test.ts', 'components/**/*.test.tsx', 'app/**/*.test.ts', 'app/**/*.test.tsx', 'middleware.test.ts'],
    restoreMocks: true,
  },
})
