/**
 * Cache Utility Tests
 *
 * Exercises the current in-memory MemoryCache via its public API
 * (getCached / setCached / invalidatePrefix). The cache keys off Date.now()
 * for TTL, so expiry is driven with fake timers. (The previous suite tested a
 * removed useStorage/KV-backed implementation and inspected internal storage.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getCached, setCached, invalidatePrefix } from '../../../server/utils/cache'

describe('cache utility', () => {
  beforeEach(async () => {
    // The generic cache is a module-level singleton — reset it between tests.
    await invalidatePrefix('')
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('setCached / getCached', () => {
    it('round-trips a stored value', () => {
      setCached('test-key', { data: 'value' }, 60000)
      expect(getCached('test-key')).toEqual({ data: 'value' })
    })

    it('returns undefined for missing keys', () => {
      expect(getCached('nonexistent')).toBeUndefined()
    })

    it('overwrites existing values', () => {
      setCached('overwrite', 'first', 60000)
      setCached('overwrite', 'second', 60000)
      expect(getCached('overwrite')).toBe('second')
    })

    it('expires entries after their TTL and deletes them on read', () => {
      setCached('ttl', 'value', 5000)
      expect(getCached('ttl')).toBe('value')
      vi.advanceTimersByTime(5001)
      expect(getCached('ttl')).toBeUndefined()
    })

    it('keeps entries within their TTL window', () => {
      setCached('within', 'value', 5000)
      vi.advanceTimersByTime(4999)
      expect(getCached('within')).toBe('value')
    })

    it('handles complex data types', () => {
      const complex = { array: [1, 2, 3], nested: { a: { b: { c: 'deep' } } }, date: '2024-01-01T00:00:00Z' }
      setCached('complex', complex, 60000)
      expect(getCached('complex')).toEqual(complex)
    })

    it('stores null and undefined values', () => {
      setCached('null-value', null, 60000)
      setCached('undefined-value', undefined, 60000)
      expect(getCached('null-value')).toBeNull()
      expect(getCached('undefined-value')).toBeUndefined()
    })
  })

  describe('invalidatePrefix', () => {
    it('removes all entries with a matching prefix, leaving others', async () => {
      setCached('user:1', 'a', 60000)
      setCached('user:2', 'b', 60000)
      setCached('project:1', 'c', 60000)
      await invalidatePrefix('user:')
      expect(getCached('user:1')).toBeUndefined()
      expect(getCached('user:2')).toBeUndefined()
      expect(getCached('project:1')).toBe('c')
    })

    it('empty prefix clears everything', async () => {
      setCached('a', 1, 60000)
      setCached('b', 2, 60000)
      await invalidatePrefix('')
      expect(getCached('a')).toBeUndefined()
      expect(getCached('b')).toBeUndefined()
    })

    it('does nothing when no keys match', async () => {
      setCached('existing', 'keep', 60000)
      await invalidatePrefix('nonexistent:')
      expect(getCached('existing')).toBe('keep')
    })
  })
})
