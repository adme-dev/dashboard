import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FAIL_STALE_ASSET_INTELLIGENCE_JOBS_SQL,
  STALE_QUEUED_JOB_MESSAGE,
  STALE_QUEUED_JOB_MINUTES,
  STALE_RUNNING_JOB_MESSAGE,
  STALE_RUNNING_JOB_MINUTES
} from '~~/shared/video/assetIntelligenceStaleJobs'

interface FakeClient {
  options: Record<string, unknown>
  connect: ReturnType<typeof vi.fn>
  query: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
}

const clients: FakeClient[] = []
let nextQuery: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
let failNextConnect = false

vi.mock('pg', () => {
  class Client {
    options: Record<string, unknown>
    connect = vi.fn(async () => {
      if (!failNextConnect) return
      failNextConnect = false
      throw new Error('connect timeout')
    })

    query = vi.fn((sql: string, params?: unknown[]) => nextQuery(sql, params))
    end = vi.fn().mockResolvedValue(undefined)
    constructor(options: Record<string, unknown>) {
      this.options = options
      clients.push(this as unknown as FakeClient)
    }
  }
  return { default: { Client }, Client }
})

const db = await import('~~/workers/asset-intelligence/src/db')

describe('asset intelligence worker database access', () => {
  beforeEach(() => {
    clients.length = 0
    nextQuery = async () => ({ rows: [] })
    failNextConnect = false
    ;(globalThis as any).__HYPERDRIVE_CS = 'postgres://hyperdrive.local/db'
  })

  // The wedge: a client kept in module scope was reused by the next queue delivery,
  // whose query never settled. Every query must open and close its own connection.
  it('opens a new connection for every query and closes it, so no socket outlives a delivery', async () => {
    nextQuery = async () => ({ rows: [{ r2_key: 'asset.jpg', thumbnail_key: null }] })

    await db.getVideoAssetPictureKeys('asset-1')
    await db.getVideoAssetPictureKeys('asset-2')
    await db.getVideoAssetR2Key('asset-3')

    expect(clients).toHaveLength(3)
    expect(new Set(clients).size).toBe(3)
    for (const client of clients) {
      expect(client.options.connectionString).toBe('postgres://hyperdrive.local/db')
      expect(client.connect).toHaveBeenCalledTimes(1)
      expect(client.query).toHaveBeenCalledTimes(1)
      expect(client.end).toHaveBeenCalledTimes(1)
    }
  })

  it('bounds how long a connection or query may take, so a dead database cannot hang a delivery', async () => {
    await db.getAssetIntelligenceJob('job-1')

    expect(clients[0]!.options.connectionTimeoutMillis).toBeGreaterThan(0)
    expect(clients[0]!.options.query_timeout).toBeGreaterThan(0)
    expect(clients[0]!.options.statement_timeout).toBeGreaterThan(0)
  })

  it('closes the connection when the query fails', async () => {
    nextQuery = async () => { throw new Error('connection terminated') }

    await expect(db.getVideoAssetR2Key('asset-1')).rejects.toThrow('connection terminated')

    expect(clients).toHaveLength(1)
    expect(clients[0]!.end).toHaveBeenCalledTimes(1)
  })

  it('closes the connection when connecting fails, and the next query still gets a fresh one', async () => {
    nextQuery = async () => ({ rows: [{ r2_key: 'asset.jpg' }] })
    failNextConnect = true
    await expect(db.getVideoAssetR2Key('asset-1')).rejects.toThrow('connect timeout')
    expect(clients[0]!.end).toHaveBeenCalledTimes(1)

    await expect(db.getVideoAssetR2Key('asset-1')).resolves.toBe('asset.jpg')
    expect(clients).toHaveLength(2)
  })

  it('fails stranded jobs in every project and reports how many it closed', async () => {
    const seen: { sql: string, params?: unknown[] }[] = []
    nextQuery = async (sql, params) => {
      seen.push({ sql, params })
      return { rows: [{ id: 'job-1' }, { id: 'job-2' }] }
    }

    await expect(db.failStaleAssetIntelligenceJobs()).resolves.toBe(2)

    expect(seen[0]!.sql).toBe(FAIL_STALE_ASSET_INTELLIGENCE_JOBS_SQL)
    expect(seen[0]!.params).toEqual([null, STALE_RUNNING_JOB_MINUTES, STALE_QUEUED_JOB_MINUTES, STALE_RUNNING_JOB_MESSAGE, STALE_QUEUED_JOB_MESSAGE])
  })
})

describe('stale asset intelligence job rule', () => {
  it('only touches queued and running jobs, and leaves a retry enough time to land', () => {
    const sql = FAIL_STALE_ASSET_INTELLIGENCE_JOBS_SQL
    expect(sql).toContain(`status = 'running' AND updated_at < now()`)
    expect(sql).toContain(`status = 'queued' AND created_at < now()`)
    expect(sql).not.toMatch(/succeeded|blocked/)
    // A job runs in under a minute and the queue retries twice, 30 seconds apart.
    expect(STALE_RUNNING_JOB_MINUTES).toBeGreaterThanOrEqual(5)
    expect(STALE_QUEUED_JOB_MINUTES).toBeGreaterThanOrEqual(STALE_RUNNING_JOB_MINUTES)
  })
})
