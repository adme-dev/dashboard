import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
    alias: [
      // More-specific prefixes must come before the bare ~ catch-all
      { find: '~~/server', replacement: resolve(__dirname, 'server') },
      { find: '~/utils', replacement: resolve(__dirname, 'app/utils') },
      { find: '~/types', replacement: resolve(__dirname, 'app/types') },
      { find: '~/composables', replacement: resolve(__dirname, 'app/composables') },
      { find: '~/components', replacement: resolve(__dirname, 'app/components') },
      { find: '~', replacement: resolve(__dirname, '.') },
      { find: '~~', replacement: resolve(__dirname, '.') },
      { find: '@', replacement: resolve(__dirname, '.') }
    ]
  }
})
