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

// Shared mock impls reused by both the #imports mock and the Nuxt auto-import globals.
const mockRuntimeConfig = () => ({
  databaseUrl: 'postgresql://test:test@localhost:5432/test_db',
  jwtSecret: 'test-secret-key',
  resendApiKey: 'test-resend-key',
  groqApiKey: 'test-groq-key',
  public: {}
})

const mockCreateError = (opts: { statusCode: number; statusMessage: string }) => {
  const error = new Error(opts.statusMessage) as any
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

// Mock Nuxt runtime config and utilities from #imports
vi.mock('#imports', () => ({
  useRuntimeConfig: mockRuntimeConfig,
  createError: mockCreateError,
  getHeader: vi.fn(),
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  useStorage: mockUseStorage
}))

// Also provide the commonly auto-imported Nuxt helpers as globals — server utils
// call these bare (Nuxt auto-imports them in prod); in the vitest node env they'd
// otherwise be ReferenceErrors. Mirrors the useStorage global pattern.
;(globalThis as any).useStorage = mockUseStorage
;(globalThis as any).useRuntimeConfig = mockRuntimeConfig
;(globalThis as any).createError = mockCreateError

// Set test environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'
process.env.JWT_SECRET = 'test-secret-key'
process.env.NODE_ENV = 'test'

// Export the mock storage for tests that need direct access
export { mockCacheStorage }
