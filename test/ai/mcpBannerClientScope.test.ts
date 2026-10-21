import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildBannerReadRunner,
  buildBannerProposeDeps,
  buildBannerConfirmDeps,
  createBannerProjectDraft,
  dispatchBannerConfirm,
  BANNER_PROJECT_LIST_CAP,
  BANNER_JOB_STATUS_CAP
} from '~~/server/utils/ai/mcp/bannerRunner'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const transport = vi.hoisted(() => ({ rows: vi.fn(), one: vi.fn(), execute: vi.fn(), upload: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: transport.rows,
  queryOne: transport.one,
  execute: transport.execute
}))
vi.mock('~~/server/utils/storage', () => ({ uploadFile: transport.upload }))

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLIENT = id(1)
const FOREIGN = id(2)
const OWN_PROJECT = id(10)
const FOREIGN_PROJECT = id(11)
const UNSCOPED_PROJECT = id(12)
const OWN_JOB = id(20)
const FOREIGN_JOB = id(21)
const UNSCOPED_JOB = id(22)
const canvas = { mrec: { layers: [{ id: 1, type: 'text', text: 'Synthetic creative' }] } }
interface ProjectList { projects: Array<{ id: string }>, limit: number, truncatedAtSource: boolean }
interface JobList { jobs: Array<{ jobId: string }>, limit: number, ignoredJobIds: number }
let db: PGlite
function context(role: string, clientScope?: unknown): ToolContext {
  return { userId: 'synthetic-staff', userRole: role, clientScope, source: 'mcp', event: { context: {} } } as ToolContext
}
function confirmDeps() {
  return {
    ...buildBannerConfirmDeps(),
    buildHtml: vi.fn().mockReturnValue('<div>Synthetic creative</div>'),
    enqueue: vi.fn().mockResolvedValue({ jobIds: ['synthetic-job'] })
  }
}
const payload = (projectId: string) => ({ projectId, format: 'mrec', fps: 30, quality: 1 as const })
async function project(projectId: string, clientId: string | null, name: string, updated = '2026-10-01T00:00:00Z') {
  await db.query(`INSERT INTO banner_projects(id,client_id,name,canvas_data,status,created_by,updated_at)
    VALUES($1,$2,$3,$4::jsonb,'draft','synthetic-staff',$5)`, [projectId, clientId, name, JSON.stringify(canvas), updated])
}
async function job(jobId: string, projectId: string) {
  await db.query(`INSERT INTO banner_render_jobs(id,project_id,format_key,width,height,fps,crf,quality,status)
    VALUES($1,$2,'mrec',300,250,30,23,1,'queued')`, [jobId, projectId])
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE banner_projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,name text,canvas_data jsonb,
      status text,created_by text,updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE banner_render_jobs (
      id uuid PRIMARY KEY,project_id uuid REFERENCES banner_projects(id),format_key text,
      width int,height int,fps int,crf int,quality int,source_r2_key text,status text,
      url text,file_size bigint,error text,created_by text
    );
  `)
  transport.rows.mockImplementation(async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows)
  transport.one.mockImplementation(async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows[0] ?? null)
  transport.execute.mockImplementation(async (query: string, params: unknown[] = []) => db.query(query, params))
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  vi.clearAllMocks()
  await db.exec('TRUNCATE banner_render_jobs,banner_projects')
  await project(OWN_PROJECT, CLIENT, 'Own project')
  await project(FOREIGN_PROJECT, FOREIGN, 'Foreign project', '2026-10-02T00:00:00Z')
  await project(UNSCOPED_PROJECT, null, 'Agency project', '2026-10-03T00:00:00Z')
  await job(OWN_JOB, OWN_PROJECT)
  await job(FOREIGN_JOB, FOREIGN_PROJECT)
  await job(UNSCOPED_JOB, UNSCOPED_PROJECT)
})

describe.each(['creative', 'owner'])('banner client scope for %s role', (role) => {
  it('filters projects by the trusted client before applying the source cap', async () => {
    for (let n = 0; n < BANNER_PROJECT_LIST_CAP + 1; n++) {
      await project(id(100 + n), FOREIGN, `New foreign ${n}`, '2026-10-20T00:00:00Z')
    }
    const result = await buildBannerReadRunner().list_banner_projects({}, context(role, CLIENT)) as ProjectList
    expect(result.projects.map(p => p.id)).toEqual([OWN_PROJECT])
    expect(result).toMatchObject({ limit: BANNER_PROJECT_LIST_CAP, truncatedAtSource: false })
  })

  it.each([FOREIGN_PROJECT, 'Foreign project', UNSCOPED_PROJECT, 'Agency project'])(
    'does not resolve guessed foreign or unscoped project %s', async (lookup) => {
      expect(await buildBannerProposeDeps().resolveProject(lookup, context(role, CLIENT))).toBeNull()
    }
  )

  it('resolves the selected client project by ID and name', async () => {
    const deps = buildBannerProposeDeps()
    for (const lookup of [OWN_PROJECT, 'Own project']) {
      expect(await deps.resolveProject(lookup, context(role, CLIENT))).toMatchObject({ id: OWN_PROJECT, name: 'Own project', formats: ['mrec'] })
    }
  })

  it('returns render status only for jobs whose project belongs to the selected client', async () => {
    const result = await buildBannerReadRunner().get_banner_render_status(
      { jobIds: [OWN_JOB, FOREIGN_JOB, UNSCOPED_JOB] }, context(role, CLIENT)
    ) as JobList
    expect(result.jobs.map(j => j.jobId)).toEqual([OWN_JOB])
  })

  it('persists the exact server-selected client on a newly created draft', async () => {
    const result = await createBannerProjectDraft({ name: 'Client draft', headline: 'Synthetic offer', format: 'mrec' }, context(role, CLIENT), db)
    expect((await db.query('SELECT client_id,created_by FROM banner_projects WHERE id=$1', [result.data.projectId])).rows)
      .toEqual([{ client_id: CLIENT, created_by: 'synthetic-staff' }])
  })

  it.each([FOREIGN_PROJECT, UNSCOPED_PROJECT])('rejects foreign confirmation %s before rendering or enqueueing', async (projectId) => {
    const deps = confirmDeps()
    expect(await dispatchBannerConfirm(payload(projectId), context(role, CLIENT), deps)).toMatchObject({ ok: false })
    expect(deps.buildHtml).not.toHaveBeenCalled()
    expect(deps.enqueue).not.toHaveBeenCalled()
    expect(transport.upload).not.toHaveBeenCalled()
    expect(transport.execute).not.toHaveBeenCalled()
  })

  it('allows confirmation of a project belonging to the selected client', async () => {
    const deps = confirmDeps()
    expect(await dispatchBannerConfirm(payload(OWN_PROJECT), context(role, CLIENT), deps)).toMatchObject({ ok: true, data: { jobIds: ['synthetic-job'] } })
    expect(deps.buildHtml).toHaveBeenCalledOnce()
    expect(deps.enqueue).toHaveBeenCalledOnce()
  })
})

it('preserves agency-wide reads, proposal resolution, drafts and confirmation when no scope is supplied', async () => {
  const ctx = context('creative')
  const runner = buildBannerReadRunner()
  const list = await runner.list_banner_projects({}, ctx) as ProjectList
  expect(list.projects.map(p => p.id).sort()).toEqual([OWN_PROJECT, FOREIGN_PROJECT, UNSCOPED_PROJECT].sort())
  expect(await buildBannerProposeDeps().resolveProject(FOREIGN_PROJECT, ctx)).toMatchObject({ id: FOREIGN_PROJECT })
  const statuses = await runner.get_banner_render_status({ jobIds: [OWN_JOB, FOREIGN_JOB, UNSCOPED_JOB] }, ctx) as JobList
  expect(statuses.jobs).toHaveLength(3)
  const draft = await createBannerProjectDraft({ name: 'Agency draft', headline: 'Synthetic offer', format: 'mrec' }, ctx, db)
  expect((await db.query('SELECT client_id FROM banner_projects WHERE id=$1', [draft.data.projectId])).rows).toEqual([{ client_id: null }])
  expect(await dispatchBannerConfirm(payload(FOREIGN_PROJECT), ctx, confirmDeps())).toMatchObject({ ok: true })
})

it('retains project and job response caps for scoped and agency-wide callers', async () => {
  const jobs: string[] = []
  for (let n = 0; n < BANNER_PROJECT_LIST_CAP + 1; n++) {
    await project(id(200 + n), CLIENT, `Own extra ${n}`, '2026-10-20T00:00:00Z')
    if (n <= BANNER_JOB_STATUS_CAP) {
      jobs.push(id(300 + n))
      await job(id(300 + n), OWN_PROJECT)
    }
  }
  for (const scope of [CLIENT, undefined]) {
    const runner = buildBannerReadRunner()
    const list = await runner.list_banner_projects({}, context('owner', scope)) as ProjectList
    expect(list.projects).toHaveLength(BANNER_PROJECT_LIST_CAP)
    expect(list.truncatedAtSource).toBe(true)
    const status = await runner.get_banner_render_status({ jobIds: jobs }, context('owner', scope)) as JobList
    expect(status.jobs).toHaveLength(BANNER_JOB_STATUS_CAP)
    expect(status).toMatchObject({ limit: BANNER_JOB_STATUS_CAP, ignoredJobIds: 1 })
  }
})

it.each(['', 'not-a-uuid', null, 42])('rejects invalid supplied client scope %j without broadening access', async (scope) => {
  const ctx = context('owner', scope)
  await expect(buildBannerReadRunner().list_banner_projects({}, ctx)).rejects.toThrow()
  await expect(buildBannerReadRunner().get_banner_render_status({ jobIds: [OWN_JOB] }, ctx)).rejects.toThrow()
  await expect(buildBannerProposeDeps().resolveProject(OWN_PROJECT, ctx)).rejects.toThrow()
  const before = (await db.query('SELECT count(*)::int AS count FROM banner_projects')).rows
  await expect(createBannerProjectDraft({ name: 'Invalid draft', headline: 'Synthetic offer', format: 'mrec' }, ctx, db)).rejects.toThrow()
  expect((await db.query('SELECT count(*)::int AS count FROM banner_projects')).rows).toEqual(before)
  const deps = confirmDeps()
  expect(await dispatchBannerConfirm(payload(OWN_PROJECT), ctx, deps)).toMatchObject({ ok: false })
  expect(deps.buildHtml).not.toHaveBeenCalled()
  expect(deps.enqueue).not.toHaveBeenCalled()
  expect(transport.rows).not.toHaveBeenCalled()
  expect(transport.one).not.toHaveBeenCalled()
  expect(transport.execute).not.toHaveBeenCalled()
})
