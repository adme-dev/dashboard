import { describe, expect, it, vi } from 'vitest'
import {
  closeEventDatabaseClients,
  getOrCreateEventDatabaseClient,
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

  it('single-flights concurrent fresh connections and closes the shared client', async () => {
    let finishConnection: ((client: { end: ReturnType<typeof vi.fn> }) => void) | undefined
    const client = { end: vi.fn().mockResolvedValue(undefined) }
    const createClient = vi.fn(() => new Promise<typeof client>((resolve) => {
      finishConnection = resolve
    }))
    const event = { context: {} as Record<string, any> }

    const first = getOrCreateEventDatabaseClient(event.context, 'fresh', createClient)
    const second = getOrCreateEventDatabaseClient(event.context, 'fresh', createClient)

    expect(createClient).toHaveBeenCalledOnce()
    finishConnection?.(client)
    expect(await first).toBe(client)
    expect(await second).toBe(client)

    await closeEventDatabaseClients(event)
    expect(client.end).toHaveBeenCalledOnce()
  })
})
