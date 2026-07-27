import { describe, expect, it, vi } from 'vitest'
import {
  closeEventDatabaseClients,
  resolveHyperdriveConnectionString
} from '../../../server/utils/db'

describe('Hyperdrive freshness routing', () => {
  const env = {
    HYPERDRIVE: { connectionString: 'postgres://cached' },
    HYPERDRIVE_FRESH: { connectionString: 'postgres://fresh' }
  }

  it('uses the cache-disabled binding for consistency-sensitive queries', () => {
    expect(resolveHyperdriveConnectionString(env, 'fresh')).toBe('postgres://fresh')
  })

  it('never falls back to the cached binding when the fresh binding is absent', () => {
    expect(resolveHyperdriveConnectionString({
      HYPERDRIVE: { connectionString: 'postgres://cached' }
    }, 'fresh')).toBeNull()
  })

  it('retains the cached binding for stale-tolerant analytics queries', () => {
    expect(resolveHyperdriveConnectionString(env, 'cached')).toBe('postgres://cached')
  })

  it('closes and clears both per-request clients after a response', async () => {
    const cached = { end: vi.fn().mockResolvedValue(undefined) }
    const fresh = { end: vi.fn().mockResolvedValue(undefined) }
    const event = {
      context: {
        _pgClient: cached,
        _pgClientFresh: fresh
      }
    }

    await closeEventDatabaseClients(event)

    expect(cached.end).toHaveBeenCalledOnce()
    expect(fresh.end).toHaveBeenCalledOnce()
    expect(event.context._pgClient).toBeNull()
    expect(event.context._pgClientFresh).toBeNull()
  })
})
