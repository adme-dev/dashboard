/**
 * Database Utility Tests
 *
 * Tests the CURRENT dual-driver db layer (server/utils/db.ts):
 *   Hyperdrive (pg TCP) when a request context exposes the HYPERDRIVE binding,
 *   else the neon() HTTP driver. In the vitest node env there is no `useEvent`
 *   global, so getHyperdriveCs()/getHyperdriveClient() throw-and-catch to null
 *   and every call deterministically takes the neon() HTTP path. Transactions
 *   likewise fall back to the Neon `Pool` (WebSocket) branch.
 *
 * We therefore mock `@neondatabase/serverless`:
 *   - neon() returns a tagged-template fn that also carries a `.query` method
 *     (db.ts constructs it with { fullResults: true } and calls sqlFn.query()).
 *   - Pool is a lightweight stub for the transaction fallback.
 * `pg` is mocked only so its (inactive) default import resolves.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- neon() HTTP driver: shared query mock + transaction Pool stubs ---
const mockNeonQuery = vi.fn()
const mockPoolConnect = vi.fn()
const mockPoolEnd = vi.fn()
const mockPoolOn = vi.fn()
const mockClientQuery = vi.fn()
const mockClientRelease = vi.fn()

vi.mock('@neondatabase/serverless', () => {
  // neon() returns a callable (tagged-template) that also exposes .query()
  const neon = vi.fn(() => {
    const sqlFn: any = () => {}
    sqlFn.query = mockNeonQuery
    return sqlFn
  })
  class MockPool {
    on = mockPoolOn
    connect = mockPoolConnect
    end = mockPoolEnd
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_opts?: unknown) {}
  }
  return { neon, Pool: MockPool }
})

// db.ts imports the pg default for the (inactive-in-tests) Hyperdrive path.
vi.mock('pg', () => {
  class MockClient {
    connect = vi.fn().mockResolvedValue(undefined)
    query = vi.fn()
    end = vi.fn().mockResolvedValue(undefined)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_opts?: unknown) {}
  }
  return { default: { Client: MockClient } }
})

import {
  query,
  queryRows,
  queryOne,
  queryCount,
  execute,
  transaction,
  getDb,
  db
} from '../../../server/utils/db'

beforeEach(() => {
  vi.clearAllMocks()
  // Re-establish default implementations (clearAllMocks keeps impls, but reset
  // any leftover *Once queues from prior tests to avoid cross-test bleed).
  mockNeonQuery.mockReset()
  mockNeonQuery.mockResolvedValue({ rows: [], rowCount: 0 })
  mockClientQuery.mockReset()
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 })
  mockClientRelease.mockReset()
  mockPoolConnect.mockReset()
  mockPoolConnect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease })
  mockPoolEnd.mockReset()
  mockPoolEnd.mockResolvedValue(undefined)
})

describe('database utility', () => {
  describe('query / queryRows', () => {
    it('returns the rows array from the driver result', async () => {
      mockNeonQuery.mockResolvedValue({ rows: [{ id: 1, name: 'Test' }], rowCount: 1 })

      const result = await query('SELECT * FROM users WHERE id = $1', [1])

      expect(result).toEqual([{ id: 1, name: 'Test' }])
      expect(mockNeonQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1])
    })

    it('defaults params to an empty array when omitted', async () => {
      mockNeonQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      await query('SELECT 1')

      expect(mockNeonQuery).toHaveBeenCalledWith('SELECT 1', [])
    })

    it('returns [] when the driver yields no rows property', async () => {
      mockNeonQuery.mockResolvedValue({ rowCount: 0 })

      await expect(query('SELECT 1')).resolves.toEqual([])
    })

    it('queryRows is the same callable as query', () => {
      expect(queryRows).toBe(query)
    })

    it('propagates a non-retryable driver error', async () => {
      mockNeonQuery.mockRejectedValue(new Error('syntax error at or near "FROM"'))

      await expect(query('SELECT bad')).rejects.toThrow('syntax error')
      // non-retryable => exactly one attempt
      expect(mockNeonQuery).toHaveBeenCalledTimes(1)
    })
  })

  describe('queryOne', () => {
    it('returns the first row when present', async () => {
      mockNeonQuery.mockResolvedValue({ rows: [{ id: 'a' }, { id: 'b' }] })

      await expect(queryOne('SELECT 1')).resolves.toEqual({ id: 'a' })
    })

    it('returns null when there are no rows', async () => {
      mockNeonQuery.mockResolvedValue({ rows: [] })

      await expect(queryOne('SELECT 1')).resolves.toBeNull()
    })
  })

  describe('queryCount', () => {
    it('parses the count column as an integer', async () => {
      mockNeonQuery.mockResolvedValue({ rows: [{ count: '42' }] })

      await expect(queryCount('SELECT COUNT(*) FROM t')).resolves.toBe(42)
    })

    it('returns 0 when no rows are returned', async () => {
      mockNeonQuery.mockResolvedValue({ rows: [] })

      await expect(queryCount('SELECT COUNT(*) FROM t')).resolves.toBe(0)
    })
  })

  describe('execute', () => {
    it('returns the affected row count', async () => {
      mockNeonQuery.mockResolvedValue({ rows: [], rowCount: 3 })

      await expect(execute('UPDATE t SET x = 1', [])).resolves.toBe(3)
    })

    it('returns 0 when rowCount is undefined', async () => {
      mockNeonQuery.mockResolvedValue({ rows: [] })

      await expect(execute('UPDATE t SET x = 1')).resolves.toBe(0)
    })
  })

  describe('transaction (Neon Pool fallback)', () => {
    it('wraps the callback in BEGIN/COMMIT and returns its value', async () => {
      const result = await transaction(async (client: any) => {
        await client.query('INSERT INTO t (x) VALUES ($1)', [1])
        return 'ok'
      })

      expect(result).toBe('ok')
      const sqls = mockClientQuery.mock.calls.map(c => c[0])
      expect(sqls[0]).toBe('BEGIN')
      expect(sqls).toContain('INSERT INTO t (x) VALUES ($1)')
      expect(sqls[sqls.length - 1]).toBe('COMMIT')
      expect(mockClientRelease).toHaveBeenCalledTimes(1)
      expect(mockPoolEnd).toHaveBeenCalledTimes(1)
    })

    it('rolls back and rethrows when the callback throws', async () => {
      await expect(
        transaction(async () => {
          throw new Error('boom')
        })
      ).rejects.toThrow('boom')

      const sqls = mockClientQuery.mock.calls.map(c => c[0])
      expect(sqls).toContain('BEGIN')
      expect(sqls).toContain('ROLLBACK')
      expect(sqls).not.toContain('COMMIT')
      // client released and pool closed even on failure
      expect(mockClientRelease).toHaveBeenCalledTimes(1)
      expect(mockPoolEnd).toHaveBeenCalledTimes(1)
    })
  })

  describe('db / getDb compatibility wrappers', () => {
    it('db.query passes through to the driver and returns the full result', async () => {
      const full = { rows: [{ id: 1 }], rowCount: 1 }
      mockNeonQuery.mockResolvedValue(full)

      await expect(db.query('SELECT 1', [])).resolves.toBe(full)
      expect(mockNeonQuery).toHaveBeenCalledWith('SELECT 1', [])
    })

    it('getDb().query passes through to the driver', async () => {
      const full = { rows: [{ id: 2 }], rowCount: 1 }
      mockNeonQuery.mockResolvedValue(full)

      await expect(getDb().query('SELECT 2')).resolves.toBe(full)
      expect(mockNeonQuery).toHaveBeenCalledWith('SELECT 2', [])
    })
  })

  describe('withRetry transient-error handling', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('retries a retryable error and then succeeds', async () => {
      vi.useFakeTimers()
      mockNeonQuery
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 })

      const p = query('SELECT 1')
      await vi.runAllTimersAsync()

      await expect(p).resolves.toEqual([{ ok: 1 }])
      expect(mockNeonQuery).toHaveBeenCalledTimes(2)
    })

    it('gives up after exhausting retries on a persistent retryable error', async () => {
      vi.useFakeTimers()
      mockNeonQuery.mockRejectedValue(new Error('ECONNRESET'))

      const p = query('SELECT 1')
      // attach a rejection handler before advancing timers to avoid an
      // unhandled rejection warning while the retry loop is in flight
      const assertion = expect(p).rejects.toThrow('ECONNRESET')
      await vi.runAllTimersAsync()
      await assertion

      // MAX_RETRIES = 3 => 1 initial attempt + 3 retries = 4 calls
      expect(mockNeonQuery).toHaveBeenCalledTimes(4)
    })

    it('does not retry a non-retryable error', async () => {
      mockNeonQuery.mockRejectedValue(new Error('permission denied for table t'))

      await expect(query('SELECT 1')).rejects.toThrow('permission denied')
      expect(mockNeonQuery).toHaveBeenCalledTimes(1)
    })
  })
})
