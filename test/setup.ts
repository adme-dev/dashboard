/**
 * Test Setup
 * Global setup for Vitest tests
 */

import { vi } from 'vitest'

// Create a shared mock storage for cache tests
const mockCacheStorage = new Map<string, any>()

// Create the mock useStorage function
const mockUseStorage = () => ({
  getItem: async (key: string) => mockCacheStorage.get(key),
  setItem: async (key: string, value: any) => { mockCacheStorage.set(key, value) },
  removeItem: async (key: string) => { mockCacheStorage.delete(key) },
  getKeys: async (prefix?: string) => {
    const keys = Array.from(mockCacheStorage.keys())
    return prefix ? keys.filter(k => k.startsWith(prefix)) : keys
  }
})

// Mock Nuxt runtime config and utilities from #imports
vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    databaseUrl: 'postgresql://test:test@localhost:5432/test_db',
    jwtSecret: 'test-secret-key',
    resendApiKey: 'test-resend-key',
    groqApiKey: 'test-groq-key'
  }),
  createError: (opts: { statusCode: number; statusMessage: string }) => {
    const error = new Error(opts.statusMessage) as any
    error.statusCode = opts.statusCode
    error.statusMessage = opts.statusMessage
    return error
  },
  getHeader: vi.fn(),
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  useStorage: mockUseStorage
}))

// Also provide useStorage as a global (Nuxt auto-imports it)
;(globalThis as any).useStorage = mockUseStorage

// Set test environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'
process.env.JWT_SECRET = 'test-secret-key'
process.env.NODE_ENV = 'test'

// Export the mock storage for tests that need direct access
export { mockCacheStorage }
