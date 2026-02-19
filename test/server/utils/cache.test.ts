/**
 * Cache Utility Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockCacheStorage } from '../../setup'
import { getCached, setCached, invalidatePrefix } from '../../../server/utils/cache'

describe('cache utility', () => {
  beforeEach(() => {
    mockCacheStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('setCached', () => {
    it('should store a value with TTL', async () => {
      await setCached('test-key', { data: 'value' }, 60000)

      const stored = mockCacheStorage.get('cache:test-key')
      expect(stored).toBeDefined()
      expect(stored.value).toEqual({ data: 'value' })
      expect(stored.expiresAt).toBeGreaterThan(Date.now())
    })

    it('should set correct expiration time', async () => {
      const now = Date.now()
      vi.setSystemTime(now)

      await setCached('ttl-test', 'value', 5000)

      const stored = mockCacheStorage.get('cache:ttl-test')
      expect(stored.expiresAt).toBe(now + 5000)
    })

    it('should overwrite existing values', async () => {
      await setCached('overwrite', 'first', 60000)
      await setCached('overwrite', 'second', 60000)

      const stored = mockCacheStorage.get('cache:overwrite')
      expect(stored.value).toBe('second')
    })
  })

  describe('getCached', () => {
    it('should return cached value if not expired', async () => {
      const now = Date.now()
      vi.setSystemTime(now)

      mockCacheStorage.set('cache:valid', {
        value: 'cached-data',
        expiresAt: now + 60000
      })

      const result = await getCached('valid')
      expect(result).toBe('cached-data')
    })

    it('should return undefined for missing keys', async () => {
      const result = await getCached('nonexistent')
      expect(result).toBeUndefined()
    })

    it('should return undefined and delete expired entries', async () => {
      const now = Date.now()
      vi.setSystemTime(now)

      mockCacheStorage.set('cache:expired', {
        value: 'old-data',
        expiresAt: now - 1000 // Already expired
      })

      const result = await getCached('expired')
      expect(result).toBeUndefined()
      expect(mockCacheStorage.has('cache:expired')).toBe(false)
    })

    it('should handle complex data types', async () => {
      const complexData = {
        array: [1, 2, 3],
        nested: { a: { b: { c: 'deep' } } },
        date: '2024-01-01T00:00:00Z'
      }

      await setCached('complex', complexData, 60000)
      const result = await getCached('complex')

      expect(result).toEqual(complexData)
    })
  })

  describe('invalidatePrefix', () => {
    it('should remove all entries with matching prefix', async () => {
      mockCacheStorage.set('cache:user:1', { value: 'a', expiresAt: Date.now() + 60000 })
      mockCacheStorage.set('cache:user:2', { value: 'b', expiresAt: Date.now() + 60000 })
      mockCacheStorage.set('cache:project:1', { value: 'c', expiresAt: Date.now() + 60000 })

      await invalidatePrefix('user:')

      expect(mockCacheStorage.has('cache:user:1')).toBe(false)
      expect(mockCacheStorage.has('cache:user:2')).toBe(false)
      expect(mockCacheStorage.has('cache:project:1')).toBe(true)
    })

    it('should handle empty prefix', async () => {
      mockCacheStorage.set('cache:a', { value: 1, expiresAt: Date.now() + 60000 })
      mockCacheStorage.set('cache:b', { value: 2, expiresAt: Date.now() + 60000 })

      // Empty prefix should match all cache entries
      await invalidatePrefix('')

      expect(mockCacheStorage.size).toBe(0)
    })

    it('should do nothing if no matches found', async () => {
      mockCacheStorage.set('cache:existing', { value: 'keep', expiresAt: Date.now() + 60000 })

      await invalidatePrefix('nonexistent:')

      expect(mockCacheStorage.has('cache:existing')).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle null and undefined values', async () => {
      await setCached('null-value', null, 60000)
      await setCached('undefined-value', undefined, 60000)

      const nullResult = await getCached('null-value')
      const undefinedResult = await getCached('undefined-value')

      expect(nullResult).toBeNull()
      expect(undefinedResult).toBeUndefined()
    })

    it('should handle zero TTL correctly', async () => {
      const now = Date.now()
      vi.setSystemTime(now)

      await setCached('zero-ttl', 'value', 0)

      // With TTL of 0, expiresAt equals now, which is considered expired
      const result = await getCached('zero-ttl')
      expect(result).toBeUndefined()
    })

    it('should handle very long TTL', async () => {
      const oneYear = 365 * 24 * 60 * 60 * 1000
      await setCached('long-ttl', 'value', oneYear)

      const stored = mockCacheStorage.get('cache:long-ttl')
      expect(stored.expiresAt).toBe(Date.now() + oneYear)
    })
  })
})
