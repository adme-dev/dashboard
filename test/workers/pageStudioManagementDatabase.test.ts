import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withManagementTransaction } from '../../workers/page-studio-management/src/database'

const { Client } = vi.hoisted(() => ({ Client: vi.fn() }))
vi.mock('pg', () => ({ default: { Client } }))

const connectionString = 'postgresql://synthetic:private-test-value@example.invalid/database'
const setupBatch = [
  'BEGIN',
  'SET LOCAL search_path TO public, pg_catalog',
  'SET LOCAL statement_timeout=\'10s\'',
  'SET LOCAL lock_timeout=\'2s\'',
  'SET LOCAL idle_in_transaction_session_timeout=\'15s\''
].join('; ')
const setupStatements = [setupBatch]

class FakeClient extends EventEmitter {
  connect = vi.fn(async () => {})
  query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [], rowCount: 0 }))
  end = vi.fn(async () => {})
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('private management database transaction lifecycle', () => {
  let client: FakeClient
  const statements = () => client.query.mock.calls.map(([sql]) => sql)

  beforeEach(() => {
    Client.mockReset()
    client = new FakeClient()
    Client.mockImplementation(function () {
      return client
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets bounded session limits in one round trip before work and commits once on one connection', async () => {
    const work = vi.fn(async (db) => {
      await db.query('SELECT $1::text AS id', ['synthetic-id'])
      return { revision: 1 }
    })
    await expect(withManagementTransaction(connectionString, work)).resolves.toEqual({ revision: 1 })
    expect(Client).toHaveBeenCalledExactlyOnceWith({ connectionString, connectionTimeoutMillis: 10_000, query_timeout: 15_000 })
    expect(client.connect).toHaveBeenCalledOnce()
    expect(work).toHaveBeenCalledOnce()
    expect(statements()).toEqual([...setupStatements, 'SELECT $1::text AS id', 'COMMIT'])
    expect(client.query).toHaveBeenCalledWith('SELECT $1::text AS id', ['synthetic-id'])
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('cleans up a failed connection without starting work or reconnecting', async () => {
    const error = new Error('connect failed')
    client.connect.mockRejectedValueOnce(error)
    const work = vi.fn()
    await expect(withManagementTransaction(connectionString, work)).rejects.toBe(error)
    expect(Client).toHaveBeenCalledOnce()
    expect(client.connect).toHaveBeenCalledOnce()
    expect(client.query).not.toHaveBeenCalled()
    expect(work).not.toHaveBeenCalled()
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('cleans up an uncertain BEGIN failure without starting or replaying work', async () => {
    const error = new Error('BEGIN connection lost')
    client.query.mockRejectedValueOnce(error)
    const work = vi.fn()
    await expect(withManagementTransaction(connectionString, work)).rejects.toBe(error)
    expect(work).not.toHaveBeenCalled()
    expect(statements()).toEqual([setupBatch, 'ROLLBACK'])
    expect(client.connect).toHaveBeenCalledOnce()
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('rolls back if setting the database limits fails and never invokes business work', async () => {
    const error = new Error('SET rejected')
    client.query.mockImplementation(async (sql) => {
      if (sql === setupBatch) throw error
      return { rows: [], rowCount: 0 }
    })
    const work = vi.fn()
    await expect(withManagementTransaction(connectionString, work)).rejects.toBe(error)
    expect(work).not.toHaveBeenCalled()
    expect(statements()).toEqual([setupBatch, 'ROLLBACK'])
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('rolls back callback failures once and preserves the original error when cleanup also fails', async () => {
    const error = new Error('business conflict')
    client.query.mockImplementation(async (sql) => {
      if (sql === 'ROLLBACK') throw new Error('rollback failed')
      return { rows: [], rowCount: 0 }
    })
    client.end.mockRejectedValueOnce(new Error('end failed'))
    const work = vi.fn(async () => {
      throw error
    })
    await expect(withManagementTransaction(connectionString, work)).rejects.toBe(error)
    expect(work).toHaveBeenCalledOnce()
    expect(statements()).toEqual([...setupStatements, 'ROLLBACK'])
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('never retries an unknown COMMIT outcome or replays the business mutation', async () => {
    const error = new Error('COMMIT response lost')
    client.query.mockImplementation(async (sql) => {
      if (sql === 'COMMIT') throw error
      return { rows: [], rowCount: 1 }
    })
    const work = vi.fn(async (db) => {
      await db.query('UPDATE synthetic SET revision = revision + 1')
    })
    await expect(withManagementTransaction(connectionString, work)).rejects.toBe(error)
    expect(work).toHaveBeenCalledOnce()
    expect(Client).toHaveBeenCalledOnce()
    expect(client.connect).toHaveBeenCalledOnce()
    expect(statements()).toEqual([...setupStatements, 'UPDATE synthetic SET revision = revision + 1', 'COMMIT', 'ROLLBACK'])
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('retains an idle connection error before a business query and still attempts rollback and cleanup', async () => {
    const error = new Error('idle ECONNRESET')
    const work = vi.fn(async (db) => {
      client.emit('error', error)
      await db.query('UPDATE synthetic SET revision = 2')
    })
    await expect(withManagementTransaction(connectionString, work)).rejects.toBe(error)
    expect(statements()).toEqual([...setupStatements, 'ROLLBACK'])
    expect(client.connect).toHaveBeenCalledOnce()
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('refuses COMMIT if the connection fails while the callback awaits unrelated work', async () => {
    const entered = deferred()
    const resume = deferred()
    const error = new Error('idle connection terminated')
    const result = withManagementTransaction(connectionString, async () => {
      entered.resolve()
      await resume.promise
      return 'would otherwise commit'
    })
    const rejected = expect(result).rejects.toBe(error)
    await entered.promise
    client.emit('error', error)
    resume.resolve()
    await rejected
    expect(statements()).toEqual([...setupStatements, 'ROLLBACK'])
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('checks connection health again after an awaited query before allowing subsequent work', async () => {
    const entered = deferred()
    const resume = deferred()
    const error = new Error('connection lost during query')
    client.query.mockImplementation(async (sql) => {
      if (sql === 'SELECT 1') {
        entered.resolve()
        await resume.promise
      }
      return { rows: [], rowCount: 0 }
    })
    const result = withManagementTransaction(connectionString, async (db) => {
      await db.query('SELECT 1')
      await db.query('UPDATE synthetic SET revision = 2')
    })
    const rejected = expect(result).rejects.toBe(error)
    await entered.promise
    client.emit('error', error)
    resume.resolve()
    await rejected
    expect(statements()).toEqual([...setupStatements, 'SELECT 1', 'ROLLBACK'])
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('does not turn a confirmed commit into a retryable failure when connection cleanup fails', async () => {
    client.end.mockRejectedValueOnce(new Error('end failed'))
    await expect(withManagementTransaction(connectionString, async () => 'committed')).resolves.toBe('committed')
    expect(statements()).toEqual([...setupStatements, 'COMMIT'])
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('never logs raw connection strings, SQL parameters or driver failures', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error(`driver diagnostic ${connectionString}`)
    await expect(withManagementTransaction(connectionString, async (db) => {
      await db.query('SELECT $1::text', ['synthetic-private-parameter'])
      throw error
    })).rejects.toBe(error)
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(errorLog).not.toHaveBeenCalled()
  })
})
