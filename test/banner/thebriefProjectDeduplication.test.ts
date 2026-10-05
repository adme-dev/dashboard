import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GodModeTransactionDb } from '../../server/utils/godMode/transactionCoordinator'
import { readTheBriefProjectIdentity } from '../../server/utils/banner/thebriefProjectImport'

const CLIENT_A = '11111111-1111-4111-8111-111111111111'
const CLIENT_B = '22222222-2222-4222-8222-222222222222'
const hash = 'a'.repeat(64)
const rows: { id: string, clientId: string | null, name: string, canvasData: unknown, tags: string[] }[] = []
const locks = new Map<string, Promise<void>>()
const queries: string[] = []
const coordinator = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: 'actor' }) }))
vi.mock('~~/server/utils/banner/godModeProjectCreation', () => ({
  executeGodModeBannerProjectCreation: (...args: unknown[]) => coordinator(...args)
}))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
const { default: createProject } = await import('../../server/api/agency/banner-studio/projects/index.post')

// Transaction harness models advisory locks remaining held until the callback commits.
async function transaction(_event: unknown, create: (db: GodModeTransactionDb) => Promise<unknown>) {
  let release: (() => void) | undefined
  const db = {
    query: async (sql: string, params: unknown[]) => {
      queries.push(sql)
      if (sql.includes('pg_advisory_xact_lock')) {
        const key = String(params[0])
        const previous = locks.get(key) || Promise.resolve()
        const current = new Promise<void>((resolve) => {
          release = resolve
        })
        locks.set(key, previous.then(() => current))
        await previous
        return { rows: [] }
      }
      if (sql.includes('FROM agency_clients')) return { rows: [CLIENT_A, CLIENT_B].includes(String(params[0])) ? [{ id: params[0] }] : [] }
      if (sql.includes('FROM banner_projects')) return { rows: rows.filter(row => row.clientId === params[0] && row.tags.includes('source:thebrief') && row.tags.some(tag => tag.toLowerCase() === params[1])).slice(0, 1) }
      if (sql.includes('INSERT INTO banner_projects')) {
        await Promise.resolve()
        const row = { id: `project-${rows.length + 1}`, clientId: params[1] as string | null, name: String(params[0]), canvasData: JSON.parse(String(params[2])), tags: params[3] as string[] }
        rows.push(row)
        return { rows: [row] }
      }
      throw new Error(`Unexpected query: ${sql}`)
    }
  }
  try {
    return await create(db as GodModeTransactionDb)
  } finally {
    release?.()
  }
}
function request(clientId: string | null = CLIENT_A, sourceHash = hash) {
  return { body: { name: 'Imported banner', clientId, tags: ['source:thebrief', `source-sha256:${sourceHash}`], canvasData: { source: 'original' } } } as never
}
beforeEach(() => {
  rows.length = 0
  queries.length = 0
  locks.clear()
  coordinator.mockReset().mockImplementation(transaction)
})

describe('TheBrief project deduplication', () => {
  it('returns the existing project on retry without overwriting saved edits', async () => {
    const first = await createProject(request())
    rows[0].name = 'Edited name'
    rows[0].canvasData = { edited: true }
    const second = await createProject(request())
    expect(second).toEqual({ ...first, name: 'Edited name', canvasData: { edited: true } })
    expect(rows).toHaveLength(1)
    expect(coordinator).toHaveBeenCalledTimes(2)
  })

  it('serialises simultaneous same-client imports before lookup and insert', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => createProject(request())))
    expect(new Set(results.map(result => result.id)).size).toBe(1)
    expect(rows).toHaveLength(1)
    expect(queries.filter(sql => sql.includes('INSERT INTO banner_projects'))).toHaveLength(1)
    expect(queries[0]).toContain('pg_advisory_xact_lock')
  })

  it('allows the same source under different clients and different sources under one client', async () => {
    await Promise.all([createProject(request(CLIENT_A)), createProject(request(CLIENT_B)), createProject(request(CLIENT_A, 'b'.repeat(64)))])
    expect(rows).toHaveLength(3)
    expect(locks.size).toBe(3)
  })

  it('canonicalises hash casing and returns an existing import', async () => {
    const first = await createProject(request(CLIENT_A, hash.toUpperCase()))
    const second = await createProject(request())
    expect(first.id).toBe(second.id)
    expect(first.tags).toContain(`source-sha256:${hash}`)
  })

  it.each([
    ['missing client', null, ['source:thebrief', `source-sha256:${hash}`]],
    ['malformed client', 'invalid', ['source:thebrief', `source-sha256:${hash}`]],
    ['missing hash', CLIENT_A, ['source:thebrief']],
    ['bad hash', CLIENT_A, ['source:thebrief', 'source-sha256:bad']],
    ['duplicate hash', CLIENT_A, ['source:thebrief', `source-sha256:${hash}`, `source-sha256:${hash}`]],
    ['mixed-case duplicate hash', CLIENT_A, ['source:thebrief', `source-sha256:${hash}`, `SOURCE-SHA256:${hash}`]],
    ['multiple hashes', CLIENT_A, ['source:thebrief', `source-sha256:${hash}`, `source-sha256:${'b'.repeat(64)}`]],
    ['missing source', CLIENT_A, [`source-sha256:${hash}`]],
    ['malformed hash key', CLIENT_A, ['source:thebrief', `source-sha256=${hash}`]],
    ['non-string tag', CLIENT_A, ['source:thebrief', `source-sha256:${hash}`, 7]]
  ])('rejects %s before a transaction starts', async (_name, clientId, tags) => {
    await expect(createProject({ body: { name: 'Import', clientId, tags } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(coordinator).not.toHaveBeenCalled()
  })

  it('rejects a nonexistent client without inserting', async () => {
    await expect(createProject(request('33333333-3333-4333-8333-333333333333'))).rejects.toMatchObject({ statusCode: 400 })
    expect(rows).toHaveLength(0)
  })

  it('preserves ordinary project creation with no extra lock or lookup', async () => {
    expect(readTheBriefProjectIdentity(null, ['ordinary'])).toBeNull()
    const event = { body: { name: 'Ordinary', tags: ['ordinary'] } } as never
    const first = await createProject(event)
    const second = await createProject(event)
    expect(first.id).not.toBe(second.id)
    expect(queries).toHaveLength(2)
    expect(queries.every(sql => sql.includes('INSERT INTO banner_projects'))).toBe(true)
    expect(first.clientId).toBeNull()
  })
})
