import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), old: vi.fn(), tx: vi.fn(), db: vi.fn() }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', () => '22222222-2222-4222-8222-222222222222')
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth, requireWriteAccess: m.auth }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: m.read, queryOne: m.read, execute: m.old, transactionWithoutRetry: m.tx }))
const remove = (await import('../../../server/api/agency/banner-studio/projects/[id].delete')).default
const actor = '11111111-1111-4111-8111-111111111111'
const project = '22222222-2222-4222-8222-222222222222'
const job = '33333333-3333-4333-8333-333333333333'
let owner: string, readOnly: boolean, snapshot: any, survivingJob: any
beforeEach(() => {
  vi.clearAllMocks(); owner = actor; readOnly = false
  snapshot = { id: project, canvasData: {}, clientId: null, createdBy: actor, updatedAt: '2026-10-27T00:00:00.000Z' }
  survivingJob = { job_id: job, project_id: project, manifest: { source: { sha256: 'unchanged' }, ingestion: { owner: { projectId: 'frozen' } }, delivery: { assets: {} } } }
  m.auth.mockResolvedValue({ id: actor })
  m.read.mockImplementation(async () => ({ ...snapshot, createdBy: owner }))
  m.tx.mockImplementation((fn: any) => fn({ query: m.db }))
  m.db.mockImplementation(async (sql: string) => {
    if (sql.includes('DELETE FROM banner_dissections')) { survivingJob = null; return { rows: [] } }
    if (sql.includes('UPDATE banner_dissections')) { survivingJob.project_id = null; return { rows: [] } }
    if (sql.includes('DELETE FROM banner_projects')) return { rows: [{ id: project }] }
    if (sql.includes('FROM banner_dissections')) return { rows: [{ job_id: job }] }
    if (sql.includes('FROM team_members')) return { rows: [{ id: actor, user_role: 'creative', custom_role_id: null, is_active: true, sessions_invalidated_at: null }] }
    if (sql.includes('FROM custom_roles')) return { rows: [{ id: 'role', is_read_only: readOnly }] }
    if (sql.includes('FROM role_permission_groups')) return { rows: [{ permission_group: 'CREATIVE' }] }
    if (sql.includes('FROM banner_projects')) return { rows: [{ ...snapshot, createdBy: owner, client_id: null, created_by: owner }] }
    throw new Error('Unexpected query')
  })
})
describe('project deletion retains immutable dissection provenance', () => {
  it.each(['foreign-owner', 'readonly'])('denies %s before mutations', async reason => {
    if (reason === 'foreign-owner') owner = job
    else readOnly = true
    await expect(remove({} as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.old).not.toHaveBeenCalled()
    expect(m.db.mock.calls.filter(([sql]) => /^\s*(UPDATE|DELETE)/.test(sql))).toEqual([])
  })
  it('detaches import destination while retaining source/ingestion/registry in the same transaction', async () => {
    const manifest = structuredClone(survivingJob.manifest)
    await expect(remove({} as any)).resolves.toMatchObject({ success: true })
    expect(survivingJob).toMatchObject({ job_id: job, project_id: null, manifest })
    expect(m.tx).toHaveBeenCalledTimes(1)
    expect(m.old).not.toHaveBeenCalled()
    expect(m.db.mock.calls.some(([sql]) => sql.includes('DELETE FROM banner_dissections'))).toBe(false)
  })
  it.each([
    { square: { dissectionSource: { jobId: job, sourceSha256: 'a'.repeat(64) }, layers: [{ text: 'Private source text' }] } },
    { square: { layers: [{ src: 'scoped-banner-exports/x.png' }] } },
    { square: { layers: [{ src: 'a%2Fbanner-studio%2Fdissect%2Fx.png' }] } },
    '{malformed protected canvas',
  ])('allows target-authorized cleanup without reading source manifests: %j', async canvasData => {
    snapshot.canvasData = canvasData
    const manifest = structuredClone(survivingJob.manifest)
    await expect(remove({} as any)).resolves.toMatchObject({ success: true })
    expect(survivingJob).toEqual({ job_id: job, project_id: null, manifest })
    expect(m.db.mock.calls.filter(([sql]) => sql.includes('FROM banner_dissections')).every(([sql]) => /^SELECT job_id /.test(sql))).toBe(true)
    expect(m.db.mock.calls[0][0]).toMatch(/ORDER BY job_id FOR UPDATE/)
    expect(m.db.mock.calls[0][1]).toEqual([project])
  })
  it('rejects changed project snapshots before mutation', async () => {
    m.read.mockImplementation(async () => ({ ...snapshot, updatedAt: '2026-10-26T00:00:00.000Z' }))
    await expect(remove({} as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(survivingJob.project_id).toBe(project)
    expect(m.db.mock.calls.filter(([sql]) => /^\s*(UPDATE|DELETE)/.test(sql))).toEqual([])
  })
  it('rejects newly linked imports before mutation without acquiring a late job lock', async () => {
    const original = m.db.getMockImplementation()!
    m.db.mockImplementation(async (sql, ...args) => sql.includes('FROM banner_dissections') && !sql.includes('FOR UPDATE')
      ? { rows: [{ job_id: 'newly-linked' }] } : original(sql, ...args))
    await expect(remove({} as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(survivingJob.project_id).toBe(project)
    expect(m.db.mock.calls.filter(([sql]) => /^\s*(UPDATE|DELETE)/.test(sql))).toEqual([])
  })
  it('takes the project FOR UPDATE right after job locks, before authority, so it never upgrades FOR SHARE', async () => {
    await expect(remove({} as any)).resolves.toMatchObject({ success: true })
    const sqls = m.db.mock.calls.map(([sql]) => sql as string)
    const projectLocks = sqls.filter(sql => sql.includes('FROM banner_projects') && /FOR (UPDATE|SHARE)/.test(sql))
    expect(projectLocks[0]).toMatch(/FOR UPDATE/)
    expect(sqls.indexOf(projectLocks[0]!)).toBe(1)
    expect(sqls.findIndex(sql => sql.includes('FROM team_members'))).toBeGreaterThan(1)
  })
  it('reports a project deleted while waiting for its lock as not found, without mutations', async () => {
    const original = m.db.getMockImplementation()!
    m.db.mockImplementation(async (sql, ...args) => /^SELECT id FROM banner_projects .*FOR UPDATE/.test(sql) ? { rows: [] } : original(sql, ...args))
    await expect(remove({} as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(m.db.mock.calls.some(([sql]) => sql.includes('FROM team_members'))).toBe(false)
    expect(m.db.mock.calls.filter(([sql]) => /^\s*(UPDATE|DELETE)/.test(sql))).toEqual([])
  })
  it('propagates target authority outages without mutations', async () => {
    const original = m.db.getMockImplementation()!
    m.db.mockImplementation(async (sql, ...args) => {
      if (sql.includes('FROM team_members')) throw new Error('Database unavailable')
      return original(sql, ...args)
    })
    await expect(remove({} as any)).rejects.toMatchObject({ statusCode: 503 })
    expect(m.db.mock.calls.filter(([sql]) => /^\s*(UPDATE|DELETE)/.test(sql))).toEqual([])
  })
})
