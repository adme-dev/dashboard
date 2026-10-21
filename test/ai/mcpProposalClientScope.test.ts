import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { proposeAction } from '~~/server/utils/ai/pendingActions'
import { executeOwnerMcpConfirm } from '~~/server/utils/ai/mcp/ownerConfirm'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const edges = vi.hoisted(() => ({ one: vi.fn(), execute: vi.fn(), executor: vi.fn(), getExecutor: vi.fn(), googleDispatch: vi.fn(), bannerDispatch: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: edges.one, execute: edges.execute }))
vi.mock('~~/server/utils/ai/executors', () => ({ getExecutor: edges.getExecutor }))
vi.mock('~~/server/utils/ai/mcp/bannerRunner', () => ({ buildBannerConfirmDeps: () => ({}), dispatchBannerConfirm: edges.bannerDispatch }))
vi.mock('~~/server/utils/ai/mcp/videoRunner', () => ({ buildVideoConfirmDeps: () => ({}) }))
vi.mock('~~/server/utils/ai/mcp/videoTools', () => ({ dispatchVideoConfirm: vi.fn(async () => null) }))
vi.mock('~~/server/utils/ai/mcp/feedRunner', () => ({ buildFeedConfirmDeps: () => ({}) }))
vi.mock('~~/server/utils/ai/mcp/feedTools', () => ({ dispatchFeedConfirm: vi.fn(async () => null) }))
vi.mock('~~/server/utils/ai/mcp/googleAdsServer', () => ({ buildGoogleAdsConfirmDependencies: () => ({}) }))
vi.mock('~~/server/utils/ai/mcp/googleAdsTools', () => ({ dispatchGoogleAdsConfirm: edges.googleDispatch }))

const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FOREIGN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PROPOSAL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const PROJECT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const JOB = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
let db: PGlite

function context(clientScope = CLIENT): ToolContext {
  return { userId: USER, userRole: 'owner', clientScope, source: 'mcp', event: { context: {} } as unknown as ToolContext['event'] }
}
function unscoped(): ToolContext {
  const ctx = context()
  delete ctx.clientScope
  return ctx
}
function execution() {
  return { markDispatched: vi.fn(), captureResult: vi.fn() }
}
async function seed(scope: string | null, status = 'proposed', tool = 'create_task') {
  await db.query(`INSERT INTO ai_pending_actions (id,user_id,tool_name,resolved_payload,status,source,client_scope,result_payload)
    VALUES ($1,$2,$3,'{"title":"Synthetic task"}'::jsonb,$4,'mcp',$5,$6::jsonb)`,
  [PROPOSAL, USER, tool, status, scope, status === 'executed' ? JSON.stringify({ resultRef: 'private-result', summary: 'Private outcome' }) : null])
}
async function stored() {
  return (await db.query<{ status: string, client_scope: string | null, result_payload: unknown, confirmed_by: string | null }>('SELECT * FROM ai_pending_actions WHERE id=$1', [PROPOSAL])).rows[0]
}
function expectNoDispatch(services: ReturnType<typeof execution>) {
  expect(edges.executor).not.toHaveBeenCalled()
  expect(edges.googleDispatch).not.toHaveBeenCalled()
  expect(edges.bannerDispatch).not.toHaveBeenCalled()
  expect(services.markDispatched).not.toHaveBeenCalled()
  expect(services.captureResult).not.toHaveBeenCalled()
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE ai_pending_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid, user_id uuid NOT NULL,
    tool_name text NOT NULL, resolved_payload jsonb, status text DEFAULT 'proposed', source text,
    client_scope uuid, god_mode_execution_key text, god_mode_state text,
    confirmed_by uuid, executed_at timestamptz, expires_at timestamptz DEFAULT now() + interval '1 hour',
    result_payload jsonb, result_ref text
  );
  CREATE TABLE banner_projects (id uuid PRIMARY KEY, client_id uuid);
  CREATE TABLE banner_render_jobs (id uuid PRIMARY KEY, project_id uuid REFERENCES banner_projects(id));`)
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  vi.resetAllMocks()
  await db.exec('TRUNCATE ai_pending_actions, banner_render_jobs, banner_projects')
  edges.one.mockImplementation(async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] ?? null)
  edges.execute.mockImplementation(async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).affectedRows)
  edges.executor.mockResolvedValue({ resultRef: 'task-1', summary: 'Created synthetic task' })
  edges.getExecutor.mockReturnValue({ toolName: 'create_task', label: 'Create task', riskTier: 'confirm', execute: edges.executor })
  edges.googleDispatch.mockResolvedValue(null)
  edges.bannerDispatch.mockResolvedValue(null)
})

describe('real proposal persistence binds server scope', () => {
  it('stores the normalized server scope independently of the proposed payload', async () => {
    const id = await proposeAction(context(CLIENT.toUpperCase()), null, 'create_task', { clientId: FOREIGN, client_scope: FOREIGN })
    const row = (await db.query<{ client_scope: string, resolved_payload: unknown }>('SELECT client_scope,resolved_payload FROM ai_pending_actions WHERE id=$1', [id])).rows[0]
    expect(row.client_scope).toBe(CLIENT)
    expect(row.resolved_payload).toEqual({ clientId: FOREIGN, client_scope: FOREIGN })
  })

  it('keeps legacy unscoped agency proposals null scoped', async () => {
    const id = await proposeAction(unscoped(), null, 'create_task', { clientId: CLIENT })
    const row = (await db.query<{ client_scope: string | null }>('SELECT client_scope FROM ai_pending_actions WHERE id=$1', [id])).rows[0]
    expect(row.client_scope).toBeNull()
  })

  it.each([null, '', 'invalid-scope', 123])('rejects malformed supplied scope %s before SQL', async (scope) => {
    const ctx = { ...context(), clientScope: scope } as unknown as ToolContext
    await expect(proposeAction(ctx, null, 'create_task', {})).rejects.toThrow()
    expect(edges.one).not.toHaveBeenCalled()
    expect(edges.execute).not.toHaveBeenCalled()
  })
})

describe('owner MCP confirmation enforces proposal scope in actual SQL', () => {
  it.each([FOREIGN, null])('cannot claim a proposal scoped to %s even as owner', async (scope) => {
    await seed(scope)
    const services = execution()
    await expect(executeOwnerMcpConfirm({ proposalId: PROPOSAL }, context(), services)).resolves.toMatchObject({ ok: false })
    expect(await stored()).toMatchObject({ status: 'proposed', client_scope: scope, confirmed_by: null })
    expectNoDispatch(services)
  })

  it.each([FOREIGN, null])('cannot replay a previously executed proposal scoped to %s', async (scope) => {
    await seed(scope, 'executed')
    const services = execution()
    const result = await executeOwnerMcpConfirm({ proposalId: PROPOSAL }, context(), services)
    expect(result).toMatchObject({ ok: false })
    expect(JSON.stringify(result)).not.toContain('private-result')
    expect(JSON.stringify(result)).not.toContain('Private outcome')
    expectNoDispatch(services)
  })

  it('claims an exact scope once and persists a replayable result', async () => {
    await seed(CLIENT, 'proposed', 'banner_render')
    await db.query('INSERT INTO banner_projects (id,client_id) VALUES ($1,$2)', [PROJECT, CLIENT])
    await db.query('UPDATE ai_pending_actions SET resolved_payload=$2::jsonb WHERE id=$1', [PROPOSAL, JSON.stringify({ projectId: PROJECT, format: '300x250', fps: 30, quality: 'standard' })])
    edges.bannerDispatch.mockImplementationOnce(async (_payload, _ctx, deps: { execution?: ReturnType<typeof execution> }) => {
      await db.query('INSERT INTO banner_render_jobs (id,project_id) VALUES ($1,$2)', [JOB, PROJECT])
      await deps.execution?.markDispatched()
      return { ok: true, data: { jobIds: [JOB] } }
    })
    const services = execution()
    const result = await executeOwnerMcpConfirm({ proposalId: PROPOSAL }, context(CLIENT.toUpperCase()), services)
    expect(result).toEqual({ ok: true, data: { jobIds: [JOB] } })
    expect(await stored()).toMatchObject({ status: 'executed', confirmed_by: USER, client_scope: CLIENT, result_payload: result.ok ? result.data : null })
    const replay = await executeOwnerMcpConfirm({ proposalId: PROPOSAL }, context(), execution())
    expect(replay).toEqual({ ok: true, data: { replay: 'already_confirmed', jobIds: [JOB] } })
    expect(edges.bannerDispatch).toHaveBeenCalledTimes(1)
    expect(edges.executor).not.toHaveBeenCalled()
    expect(services.markDispatched).toHaveBeenCalledTimes(1)
  })

  it('denies scoped replay of action families without a resource ownership authorizer', async () => {
    await seed(CLIENT, 'executed', 'create_task')
    const services = execution()
    const result = await executeOwnerMcpConfirm({ proposalId: PROPOSAL }, context(), services)
    expect(result).toMatchObject({ ok: false })
    expect(JSON.stringify(result)).not.toContain('private-result')
    expectNoDispatch(services)
  })

  it.each([null, '', 'invalid-scope', 123])('rejects malformed supplied confirm scope %s before SQL', async (scope) => {
    await seed(CLIENT)
    const ctx = { ...context(), clientScope: scope } as unknown as ToolContext
    const services = execution()
    await expect(executeOwnerMcpConfirm({ proposalId: PROPOSAL }, ctx, services)).rejects.toThrow()
    expect(edges.one).not.toHaveBeenCalled()
    expect(edges.execute).not.toHaveBeenCalled()
    expectNoDispatch(services)
  })

  it.each([null, CLIENT])('preserves unscoped agency access to existing proposal scope %s', async (scope) => {
    await seed(scope)
    await expect(executeOwnerMcpConfirm({ proposalId: PROPOSAL }, unscoped(), execution())).resolves.toMatchObject({ ok: true })
    await expect(executeOwnerMcpConfirm({ proposalId: PROPOSAL }, unscoped(), execution())).resolves.toMatchObject({ ok: true, data: { replay: 'already_confirmed' } })
    expect(edges.executor).toHaveBeenCalledTimes(1)
  })

  it('preserves unscoped agency access to a client-tagged Google proposal', async () => {
    await seed(CLIENT, 'proposed', 'google_ads_mutation')
    edges.googleDispatch.mockResolvedValue({ ok: true, data: { resultRef: 'google-result' } })
    await expect(executeOwnerMcpConfirm({ proposalId: PROPOSAL }, unscoped(), execution())).resolves.toEqual({ ok: true, data: { resultRef: 'google-result' } })
    expect(await stored()).toMatchObject({ status: 'executed', result_payload: { resultRef: 'google-result' } })
  })

  it('reverts an owned claim rejected before execution so it can be confirmed later', async () => {
    await seed(CLIENT)
    edges.getExecutor.mockReturnValue({ toolName: 'create_task', riskTier: 'rich_confirm', execute: edges.executor })
    const services = execution()
    await expect(executeOwnerMcpConfirm({ proposalId: PROPOSAL }, context(), services)).resolves.toMatchObject({ ok: false })
    expect(await stored()).toMatchObject({ status: 'proposed', confirmed_by: null, result_payload: null })
    expect(edges.executor).not.toHaveBeenCalled()
    expect(services.markDispatched).not.toHaveBeenCalled()
  })

  it.each([FOREIGN, null])('does not revert a claim whose scope changed to %s after claim', async (scope) => {
    await seed(CLIENT)
    edges.googleDispatch.mockImplementationOnce(async () => {
      await db.query('UPDATE ai_pending_actions SET client_scope=$2 WHERE id=$1', [PROPOSAL, scope])
      return { ok: false, code: 'confirm_required', error: 'Explicit confirmation required' }
    })
    const services = execution()
    await expect(executeOwnerMcpConfirm({ proposalId: PROPOSAL }, context(), services)).resolves.toMatchObject({ ok: false })
    expect(await stored()).toMatchObject({ status: 'executed', client_scope: scope })
    expect(edges.executor).not.toHaveBeenCalled()
    expect(services.markDispatched).not.toHaveBeenCalled()
  })

  it.each([FOREIGN, null])('does not persist results into a proposal whose scope changed to %s during execution', async (scope) => {
    await seed(CLIENT)
    edges.executor.mockImplementationOnce(async () => {
      await db.query('UPDATE ai_pending_actions SET client_scope=$2 WHERE id=$1', [PROPOSAL, scope])
      return { resultRef: 'task-1', summary: 'Created synthetic task' }
    })
    await expect(executeOwnerMcpConfirm({ proposalId: PROPOSAL }, context(), execution())).resolves.toMatchObject({ ok: true })
    expect(await stored()).toMatchObject({ status: 'executed', client_scope: scope, result_payload: null })
  })
})

describe('ordinary internal MCP confirmation scope wiring', () => {
  const source = readFileSync(new URL('../../server/api/internal/mcp/call.post.ts', import.meta.url), 'utf8')

  it('uses the same proposal store as owner confirmation', () => {
    expect(source).toMatch(/import\s*\{[^}]*claimMcpProposal[^}]*revertMcpProposal[^}]*\}\s*from\s*['"][^'"]*proposalStore['"]/s)
    expect(source).not.toMatch(/UPDATE ai_pending_actions SET status='(?:executed|proposed)'/)
  })

  it.each(['claimMcpProposal', 'revertMcpProposal', 'replayExecutedMcpProposal'])('forwards server scope to %s', (helper) => {
    expect(source).toMatch(new RegExp(`${helper}\\([^,\\n]+,[^,\\n]+,\\s*(?:clientScope|ctx\\.clientScope)\\s*\\)`))
  })

  it('forwards server scope when persisting confirmation results', () => {
    expect(source).toMatch(/persistMcpProposalResult\([^,\n]+,[^,\n]+,[^,\n]+,\s*(?:clientScope|ctx\.clientScope)\s*\)/)
  })
})
