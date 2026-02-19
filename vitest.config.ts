import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', '.nuxt', 'dist', '.netlify'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/utils/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts']
    },
    setupFiles: ['./test/setup.ts']
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, '.'),
      '~~': resolve(__dirname, '.'),
      '@': resolve(__dirname, '.'),
      '~~/server': resolve(__dirname, 'server')
    }
  }
})
