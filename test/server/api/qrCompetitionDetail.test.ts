import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  params?: Record<string, string>
}

const competitionId = '59602666-b70f-47cc-ac4e-7728f7f956b5'
const clientId = '3b095707-1e86-454a-9280-a504c1ccddc5'

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockRequireCompetitionAccess = vi.fn()

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.params?.[key]

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/qr/competitions', () => ({
  requireCompetitionAccess: (...args: unknown[]) => mockRequireCompetitionAccess(...args)
}))

const { default: competitionDetailHandler } = await import(
  '~~/server/api/agency/qr-competitions/[id].get'
)

describe('GET /api/agency/qr-competitions/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireCompetitionAccess.mockResolvedValue({
      row: {
        id: competitionId,
        client_id: clientId,
        name: 'Test competition',
        type: 'chance',
        status: 'draft'
      }
    })

    mockQueryRows.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (/\b(?:FROM|JOIN)\s+users\b/i.test(statement)) {
        throw Object.assign(new Error('relation "users" does not exist'), { code: '42P01' })
      }
      if (statement.includes('qr_competition_terms_versions')) return []
      if (statement.includes('qr_competition_documents')) return [{ id: 'document-1', uploaded_by_name: 'Uploader' }]
      if (statement.includes('qr_competition_draws')) return [{ id: 'draw-1', drawn_by_name: 'Drawer' }]
      if (statement.includes('qr_pages')) return []
      throw new Error(`Unexpected queryRows SQL: ${statement}`)
    })

    mockQueryOne.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('qr_competition_entries')) return { total: 0, valid: 0, disqualified: 0, winners: 0, people: 0 }
      if (statement.includes('agency_clients')) return { name: 'Client One' }
      throw new Error(`Unexpected queryOne SQL: ${statement}`)
    })
  })

  it('loads audit actor names from the canonical team_members table', async () => {
    const result = await competitionDetailHandler({ params: { id: competitionId } })

    expect(result.competition).toMatchObject({ id: competitionId, client_name: 'Client One' })
    expect(result.documents).toEqual([{ id: 'document-1', uploaded_by_name: 'Uploader' }])
    expect(result.draws).toEqual([{ id: 'draw-1', drawn_by_name: 'Drawer' }])

    const actorQueries = mockQueryRows.mock.calls
      .map(([sql]) => String(sql))
      .filter(sql => sql.includes('uploaded_by_name') || sql.includes('drawn_by_name'))

    expect(actorQueries).toHaveLength(2)
    expect(actorQueries.every(sql => sql.includes('LEFT JOIN team_members'))).toBe(true)
  })
})
