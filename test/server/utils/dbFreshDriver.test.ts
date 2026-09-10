import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  clients: [] as Array<{ connectionString: string, query: ReturnType<typeof vi.fn> }>,
  directQuery: vi.fn()
}))
vi.mock('@neondatabase/serverless', () => ({
  neon: () => ({ query: state.directQuery }),
  Pool: vi.fn()
}))
vi.mock('pg', () => ({
  default: {
    Client: class {
      connectionString: string
      query = vi.fn(async () => ({ rows: [{ authority: this.connectionString === 'postgres://fresh' ? 'revoked' : 'cached-grant' }] }))
      connect = vi.fn(async () => undefined)
      end = vi.fn(async () => undefined)
      constructor(options: { connectionString: string }) {
        this.connectionString = options.connectionString
        state.clients.push(this)
      }
    }
  }
}))

beforeEach(() => {
  vi.resetModules()
  state.clients.length = 0
  state.directQuery.mockReset().mockResolvedValue({ rows: [{ authority: 'revoked' }] })
})
afterEach(() => vi.unstubAllGlobals())

describe('fresh database reads at the driver boundary', () => {
  it('reads current authority through a separate connection after an ordinary cached read', async () => {
    const event = { context: { cloudflare: { env: {
      HYPERDRIVE: { connectionString: 'postgres://cached' },
      HYPERDRIVE_FRESH: { connectionString: 'postgres://fresh' }
    } } } }
    vi.stubGlobal('useEvent', () => event)
    const { queryOne, queryOneFresh } = await import('~~/server/utils/db')
    const sql = 'SELECT authority FROM saved_permissions WHERE user_id = $1'
    await expect(queryOne(sql, ['owner'])).resolves.toEqual({ authority: 'cached-grant' })
    await expect(queryOneFresh(sql, ['owner'])).resolves.toEqual({ authority: 'revoked' })
    expect(state.clients.map(client => client.connectionString)).toEqual(['postgres://cached', 'postgres://fresh'])
    expect(state.clients[1]!.query).toHaveBeenCalledWith(sql, ['owner'])
    expect(state.directQuery).not.toHaveBeenCalled()
  })

  it('uses direct Neon when the uncached binding is absent instead of reusing a cached grant', async () => {
    vi.stubGlobal('useEvent', () => ({ context: { cloudflare: { env: {
      HYPERDRIVE: { connectionString: 'postgres://cached' }
    } } } }))
    const { queryOneFresh } = await import('~~/server/utils/db')
    await expect(queryOneFresh('SELECT authority')).resolves.toEqual({ authority: 'revoked' })
    expect(state.clients).toHaveLength(0)
    expect(state.directQuery).toHaveBeenCalledWith('SELECT authority', [])
  })

  it('propagates an unavailable authoritative read rather than trying the cached binding', async () => {
    vi.stubGlobal('useEvent', () => ({ context: { cloudflare: { env: {
      HYPERDRIVE: { connectionString: 'postgres://cached' }
    } } } }))
    state.directQuery.mockRejectedValue(new Error('Authority read unavailable'))
    const { queryOneFresh } = await import('~~/server/utils/db')
    await expect(queryOneFresh('SELECT authority')).rejects.toThrow('Authority read unavailable')
    expect(state.clients).toHaveLength(0)
  })
})
