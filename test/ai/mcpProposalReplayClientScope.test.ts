import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { persistMcpProposalResult, replayExecutedMcpProposal } from '~~/server/utils/ai/mcp/proposalReplay'

const transport = vi.hoisted(() => ({ one: vi.fn(), rows: vi.fn(), execute: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: transport.one, queryRows: transport.rows, execute: transport.execute }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLIENT = id(1)
const FOREIGN = id(2)
const USER = id(3)
const OTHER_USER = id(4)
const PROPOSAL = id(5)
const PROJECT = id(10)
const OTHER_PROJECT = id(11)
const JOB = id(20)
const SOURCE = id(30)
const EXECUTED = '2026-10-21T00:00:00Z'
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE ai_pending_actions(
      id uuid PRIMARY KEY,user_id uuid,client_scope uuid,source text,status text,tool_name text,
      resolved_payload jsonb,result_payload jsonb,result_ref text,executed_at timestamptz
    );
    CREATE TABLE banner_projects(id uuid PRIMARY KEY,client_id uuid);
    CREATE TABLE banner_render_jobs(id uuid PRIMARY KEY,project_id uuid,status text);
    CREATE TABLE video_generation_jobs(
      id uuid PRIMARY KEY,tenant_id text,project_id uuid,created_by uuid,status text,error_message text,
      idempotency_key text,created_at timestamptz
    );
    CREATE TABLE video_gen_source_assets(id uuid PRIMARY KEY,client_id uuid,status text);
  `)
  transport.one.mockImplementation(async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] ?? null)
  transport.rows.mockImplementation(async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows)
  transport.execute.mockImplementation(async (sql: string, params: unknown[] = []) => db.query(sql, params))
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  vi.clearAllMocks()
  await db.exec('TRUNCATE ai_pending_actions,banner_projects,banner_render_jobs,video_generation_jobs,video_gen_source_assets')
  await db.query('INSERT INTO banner_projects VALUES($1,$2),($3,$2)', [PROJECT, CLIENT, OTHER_PROJECT])
  await db.query('INSERT INTO banner_render_jobs VALUES($1,$2,\'queued\')', [JOB, PROJECT])
  await db.query('INSERT INTO video_generation_jobs VALUES($1,$2,$3,$4,\'queued\',NULL,$5,$6)', [JOB, CLIENT, PROJECT, USER, `mcp:${PROPOSAL}`, EXECUTED])
  await db.query('INSERT INTO video_gen_source_assets VALUES($1,$2,\'approved\')', [SOURCE, CLIENT])
})
async function proposal(tool = 'video_generation', result: unknown = { jobId: JOB, status: 'queued' }, scope: string | null = CLIENT) {
  await db.query(`INSERT INTO ai_pending_actions VALUES($1,$2,$3,'mcp','executed',$4,$5::jsonb,$6::jsonb,NULL,$7)`,
    [PROPOSAL, USER, scope, tool, JSON.stringify({ projectId: PROJECT }), result === null ? null : JSON.stringify(result), EXECUTED])
}
async function savedResult() {
  return (await db.query('SELECT result_payload,result_ref FROM ai_pending_actions WHERE id=$1', [PROPOSAL])).rows
}
const creativeResults = [
  { tool: 'banner_render', result: { jobIds: [JOB] } },
  { tool: 'video_generation', result: { jobId: JOB, status: 'queued' } },
  { tool: 'video_project_create', result: { projectId: PROJECT } },
  { tool: 'video_source_promote', result: { sourceAssetId: SOURCE, status: 'approved', sourceSystem: 'banner', sourceAssetRef: id(40) } }
]

describe('proposal replay client binding', () => {
  it.each([FOREIGN, null])('filters proposal scope %j before selecting its payload', async (scope) => {
    await proposal('video_generation', { jobId: JOB }, scope)
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
    const [sql, params] = transport.one.mock.calls[0]
    expect((await db.query(sql, params)).rows).toEqual([])
    expect(transport.execute).not.toHaveBeenCalled()
  })
  it.each([
    ['user_id', OTHER_USER], ['source', 'chat'], ['status', 'proposed'], ['status', 'cancelled']
  ])('denies mismatched %s=%s for replay and persistence', async (column, value) => {
    await proposal('video_generation', null)
    await db.query(`UPDATE ai_pending_actions SET ${column}=$1 WHERE id=$2`, [value, PROPOSAL])
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
    await persistMcpProposalResult(PROPOSAL, USER, { jobId: JOB }, CLIENT)
    expect(await savedResult()).toEqual([{ result_payload: null, result_ref: null }])
  })
  it.each(['', 'not-a-uuid', null, 42])('rejects malformed scope %j before SQL', async (scope) => {
    await proposal()
    await expect(replayExecutedMcpProposal(PROPOSAL, USER, scope as unknown as string)).rejects.toThrow()
    await expect(persistMcpProposalResult(PROPOSAL, USER, { jobId: JOB }, scope as unknown as string)).rejects.toThrow()
    expect(transport.one).not.toHaveBeenCalled()
    expect(transport.execute).not.toHaveBeenCalled()
  })
  it.each([FOREIGN, null])('does not persist a result to proposal scope %j', async (scope) => {
    await proposal('video_generation', null, scope)
    await persistMcpProposalResult(PROPOSAL, USER, { jobId: JOB }, CLIENT)
    expect(await savedResult()).toEqual([{ result_payload: null, result_ref: null }])
  })
  it('persists only once for the matching scoped proposal', async () => {
    await proposal('video_generation', null)
    await persistMcpProposalResult(PROPOSAL, USER, { jobId: JOB }, CLIENT)
    await persistMcpProposalResult(PROPOSAL, USER, { jobId: id(99) }, CLIENT)
    expect(await savedResult()).toEqual([{ result_payload: { jobId: JOB }, result_ref: JOB }])
  })
  it('preserves legacy unscoped replay of client-bound Google results', async () => {
    const result = { resultRef: 'google-campaign-123', summary: 'Budget updated' }
    await proposal('google_ads_update_budget', result, FOREIGN)
    expect(await replayExecutedMcpProposal(PROPOSAL, USER)).toEqual({ ok: true, data: result })
  })
  it('preserves legacy unscoped persistence of client-bound proposals', async () => {
    await proposal('video_generation', null, FOREIGN)
    await persistMcpProposalResult(PROPOSAL, USER, { jobId: JOB })
    expect(await savedResult()).toEqual([{ result_payload: { jobId: JOB }, result_ref: JOB }])
  })
  it('fails closed for an unknown action in a client-bound replay', async () => {
    await proposal('unknown_future_action', { privateResult: 'must not disclose' })
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
  })
})

describe.each(creativeResults)('current resource ownership for $tool replay', ({ tool, result }) => {
  it('replays the exact result while its resources belong to the selected client', async () => {
    await proposal(tool, result)
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toEqual({ ok: true, data: result })
    expect(transport.execute).not.toHaveBeenCalled()
  })
  it.each([FOREIGN, null])('denies after the project is reassigned to %j', async (owner) => {
    await proposal(tool, result)
    await db.query('UPDATE banner_projects SET client_id=$1 WHERE id=$2', [owner, PROJECT])
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
    expect(transport.execute).not.toHaveBeenCalled()
  })
  it('denies after the project is deleted', async () => {
    await proposal(tool, result)
    await db.query('DELETE FROM banner_projects WHERE id=$1', [PROJECT])
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
  })
})

it('denies banner results containing a job reassigned to a different project', async () => {
  await proposal('banner_render', { jobIds: [JOB] })
  await db.query('UPDATE banner_render_jobs SET project_id=$1 WHERE id=$2', [OTHER_PROJECT, JOB])
  expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
})
it('denies a banner result containing an absent job', async () => {
  await proposal('banner_render', { jobIds: [JOB, id(99)] })
  expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
})
it.each([FOREIGN, 'agency'])('denies video results after the job tenant changes to %s', async (tenant) => {
  await proposal()
  await db.query('UPDATE video_generation_jobs SET tenant_id=$1 WHERE id=$2', [tenant, JOB])
  expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
})
it('denies a video result whose job belongs to another project of the same client', async () => {
  await proposal()
  await db.query('UPDATE video_generation_jobs SET project_id=$1 WHERE id=$2', [OTHER_PROJECT, JOB])
  expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
})
it.each([FOREIGN, null])('denies source promotion replay after source ownership changes to %j', async (owner) => {
  await proposal('video_source_promote', { sourceAssetId: SOURCE, status: 'approved', sourceSystem: 'banner', sourceAssetRef: id(40) })
  await db.query('UPDATE video_gen_source_assets SET client_id=$1 WHERE id=$2', [owner, SOURCE])
  expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
})

describe('legacy video fallback under a client-bound replay', () => {
  it('recovers and persists the matching client and project job', async () => {
    await proposal('video_generation', null)
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toEqual({ ok: true, data: { jobId: JOB, status: 'queued' } })
    expect(await savedResult()).toEqual([{ result_payload: { jobId: JOB, status: 'queued' }, result_ref: JOB }])
  })
  it.each([FOREIGN, 'agency'])('does not recover or persist a job with tenant %s', async (tenant) => {
    await proposal('video_generation', null)
    await db.query('UPDATE video_generation_jobs SET tenant_id=$1 WHERE id=$2', [tenant, JOB])
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
    expect(await savedResult()).toEqual([{ result_payload: null, result_ref: null }])
    expect(transport.execute).not.toHaveBeenCalled()
  })
  it.each([FOREIGN, null])('does not recover after project ownership changes to %j', async (owner) => {
    await proposal('video_generation', null)
    await db.query('UPDATE banner_projects SET client_id=$1 WHERE id=$2', [owner, PROJECT])
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
    expect(await savedResult()).toEqual([{ result_payload: null, result_ref: null }])
    expect(transport.execute).not.toHaveBeenCalled()
  })
  it('does not recover a job from another project', async () => {
    await proposal('video_generation', null)
    await db.query('UPDATE video_generation_jobs SET project_id=$1 WHERE id=$2', [OTHER_PROJECT, JOB])
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
    expect(await savedResult()).toEqual([{ result_payload: null, result_ref: null }])
  })
  it('preserves time-window recovery for unscoped legacy callers', async () => {
    await proposal('video_generation', null)
    await db.query('UPDATE video_generation_jobs SET idempotency_key=\'older-without-proposal-key\' WHERE id=$1', [JOB])
    expect(await replayExecutedMcpProposal(PROPOSAL, USER)).toEqual({ ok: true, data: { jobId: JOB, status: 'queued' } })
  })
  it('does not recover a nearby owned job with the wrong proposal idempotency key', async () => {
    await proposal('video_generation', null)
    await db.query('UPDATE video_generation_jobs SET tenant_id=$1 WHERE id=$2', [FOREIGN, JOB])
    await db.query('INSERT INTO video_generation_jobs VALUES($1,$2,$3,$4,\'queued\',NULL,\'older-without-proposal-key\',$5)', [id(21), CLIENT, PROJECT, USER, EXECUTED])
    expect(await replayExecutedMcpProposal(PROPOSAL, USER, CLIENT)).toBeNull()
    expect(await savedResult()).toEqual([{ result_payload: null, result_ref: null }])
    expect(transport.execute).not.toHaveBeenCalled()
  })
})
