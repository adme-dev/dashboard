import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import type { User } from '~~/server/utils/auth'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { hasAllSocialClientAccess, hasSocialClientPermission } from '~~/server/utils/social/clientAccess'
import { assertExecutableBannerEngineRequest, bannerEngineRequestSchema, type BannerEngineCapability, type BannerEngineRequest, type BannerEngineResult } from '../../../shared/bannerEngine'
import { ENGINE_JOB_LIMITS, engineJobSubmitSchema, engineJobCancelSchema, engineJobServiceActionSchema, type EngineJobStatus, type EngineJobServiceAction } from '../../../shared/bannerEngineJobs'
import { validateBannerEngineResult } from './engineResult'
import { engineJobConfig, parseEngineJob } from './engineJobHttp'
import { createEngineJobStorage, engineJobSha256, type EngineJobStorage } from './engineJobStorage'

export interface EngineJobDb {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{
    rows: T[]
  }>
}
export interface EngineJobDependencies {
  /** Must execute once, without automatic retries after any acknowledgement loss. */
  transaction<T>(callback: (db: EngineJobDb) => Promise<T>): Promise<T>
  storage: EngineJobStorage
  capabilities: readonly BannerEngineCapability[]
  now?: () => number
}
export interface EngineJobProject {
  id: string
  client_id: string | null
  created_by: string
  updated_at: string | Date
  canvas_data: unknown
}
interface Job {
  job_id: string
  attempt_id: string
  owner_id: string
  request_id: string
  payload_sha256: string
  project_id: string
  client_id: string | null
  project_owner_id: string
  request: BannerEngineRequest
  capability: BannerEngineCapability
  input_asset: BannerEngineRequest['input'] & {
    projectId: string
    clientId: string | null
  }
  input_key: string
  output_key: string
  output_asset_id: string
  status: EngineJobStatus
  claim_token_sha256: string | null
  result: BannerEngineResult | null
  failure_code: string | null
  termination: string | null
  created_at: Date | string
  updated_at: Date | string
}
const conflict = () => createError({ statusCode: 409, statusMessage: 'Engine job state or source changed' })
const missing = () => createError({ statusCode: 404, statusMessage: 'Engine job not found' })
const forbidden = () => createError({ statusCode: 403, statusMessage: 'No access to this engine project' })
const iso = (value: string | Date) => new Date(value).toISOString()
const uuid = (value: unknown) => parseEngineJob(z.string().uuid(), value).toLowerCase()
function canonical(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}
/** Saved canvas, ownership and revision are authoritative; no submitted canvas is accepted. */
export function engineJobSource(project: EngineJobProject) {
  const sourceRevision = iso(project.updated_at)
  return { projectId: project.id, clientId: project.client_id, sourceRevision,
    sourceHash: engineJobSha256(canonical({ projectId: project.id, clientId: project.client_id, ownerId: project.created_by, sourceRevision, canvasData: project.canvas_data })) }
}
/** Same stable reservation as the runner, without importing its filesystem implementation. */
export function engineJobOutputId(attemptId: string) {
  const hash = engineJobSha256(`banner-engine-preview:${uuid(attemptId)}`)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
function snapshot(job: Job) {
  return { jobId: job.job_id, attemptId: job.attempt_id, projectId: job.project_id, status: job.status,
    result: job.result, failureCode: job.failure_code, termination: job.termination,
    createdAt: iso(job.created_at), updatedAt: iso(job.updated_at) }
}
async function projectRow(db: EngineJobDb, id: string): Promise<EngineJobProject | null> {
  const result = await db.query<EngineJobProject>('SELECT id, client_id, created_by, updated_at, canvas_data FROM banner_projects WHERE id = $1 FOR SHARE', [id])
  return result.rows[0] ?? null
}
async function projectAccess(db: EngineJobDb, actor: User, project: EngineJobProject | null): Promise<EngineJobProject> {
  if (!project)
    throw missing()
  if (project.client_id) {
    if (!hasSocialClientPermission(actor))
      throw forbidden()
    if (!hasAllSocialClientAccess(actor)) {
      // Fresh locked membership, bypassing cached database read helpers.
      const assigned = await db.query('SELECT 1 FROM client_team_assignments WHERE client_id = $1 AND team_member_id = $2 FOR SHARE', [project.client_id, actor.id])
      if (!assigned.rows.length)
        throw forbidden()
    }
  } else if (project.created_by !== actor.id && !hasAllSocialClientAccess(actor))
    throw forbidden()
  return project
}
function matchesSource(job: Job, project: EngineJobProject | null): project is EngineJobProject {
  return !!project && project.client_id === job.client_id && project.created_by === job.project_owner_id
    && canonical(engineJobSource(project)) === canonical({ projectId: job.request.projectId, clientId: job.request.clientId, sourceRevision: job.request.sourceRevision, sourceHash: job.request.sourceHash })
}
function assertSource(job: Job, project: EngineJobProject | null): asserts project is EngineJobProject {
  if (!matchesSource(job, project))
    throw conflict()
}
async function jobRow(db: EngineJobDb, jobId: string): Promise<Job> {
  const result = await db.query<Job>('SELECT * FROM banner_engine_jobs WHERE job_id = $1 FOR UPDATE', [jobId])
  if (!result.rows[0])
    throw missing()
  return result.rows[0]
}
async function expire(db: EngineJobDb, job: Job): Promise<Job> {
  if (!['queued', 'running', 'cancelling'].includes(job.status))
    return job
  const result = await db.query<Job>(`UPDATE banner_engine_jobs SET status = CASE WHEN status = 'queued' THEN 'expired' ELSE 'uncertain' END,
    failure_code = 'deadline-exceeded', termination = CASE WHEN status = 'queued' THEN 'not-started' ELSE 'unconfirmed' END,
    updated_at = clock_timestamp() WHERE job_id = $1 AND status IN ('queued','running','cancelling')
    AND COALESCE(execution_deadline_at, deadline_at) <= clock_timestamp() RETURNING *`, [job.job_id])
  return result.rows[0] ?? job
}
async function state(db: EngineJobDb, job: Job, status: EngineJobStatus, code: string | null, termination: string | null): Promise<Job> {
  const result = await db.query<Job>('UPDATE banner_engine_jobs SET status = $2, failure_code = $3, termination = $4, updated_at = clock_timestamp() WHERE job_id = $1 AND status = $5 RETURNING *', [job.job_id, status, code, termination, job.status])
  if (!result.rows[0])
    throw conflict()
  return result.rows[0]
}
function claimIdentity(job: Job, action: Exclude<EngineJobServiceAction, {
  action: 'claim'
}>) {
  const expected = Buffer.from(job.claim_token_sha256 ?? '', 'hex')
  const actual = Buffer.from(engineJobSha256(action.claimToken), 'hex')
  if (job.attempt_id !== action.attemptId.toLowerCase() || expected.length !== actual.length || !timingSafeEqual(actual, expected))
    throw missing()
}
export function createEngineJobAuthority(deps: EngineJobDependencies) {
  const now = deps.now ?? Date.now
  function capability(job: Job) {
    const current = assertExecutableBannerEngineRequest(job.request, { capabilities: deps.capabilities, now: now() })
    if (canonical(current) !== canonical(job.capability))
      throw conflict()
    return current
  }
  async function userJob(db: EngineJobDb, actor: User, jobId: string, requireSource = true) {
    const job = await expire(db, await jobRow(db, uuid(jobId)))
    const project = await projectAccess(db, actor, await projectRow(db, job.project_id))
    // A moved/reassigned project never grants access to its historical private inputs/results.
    if (project.client_id !== job.client_id || project.created_by !== job.project_owner_id)
      throw forbidden()
    if (requireSource)
      assertSource(job, project)
    return job
  }
  async function serviceJob(db: EngineJobDb, action: Exclude<EngineJobServiceAction, {
    action: 'claim'
  }>) {
    const loaded = await jobRow(db, uuid(action.jobId))
    claimIdentity(loaded, action)
    let job = await expire(db, loaded)
    const project = await projectRow(db, job.project_id)
    if (!matchesSource(job, project) && ['running', 'queued'].includes(job.status)) {
      job = await state(db, job, job.status === 'queued' ? 'cancelled' : 'cancelling', 'invalid-request', job.status === 'queued' ? 'not-started' : null)
    }
    return { job, project }
  }
  async function running(action: Exclude<EngineJobServiceAction, {
    action: 'claim'
  }>) {
    // Commit expiry/cancellation fences before rejecting a stale request.
    const result = await deps.transaction(db => serviceJob(db, action))
    if (result.job.status !== 'running')
      throw conflict()
    assertSource(result.job, result.project)
    try {
      capability(result.job)
    } catch {
      throw conflict()
    }
    return result as {
      job: Job
      project: EngineJobProject
    }
  }
  return {
    async submit(actor: User, raw: unknown) {
      const body = parseEngineJob(engineJobSubmitSchema, raw)
      body.projectId = uuid(body.projectId)
      body.requestId = uuid(body.requestId)
      body.sourceRevision = iso(body.sourceRevision)
      const bytes = Buffer.from(body.input.base64, 'base64')
      const payloadDigest = engineJobSha256(canonical({ ...body, input: { mimeType: body.input.mimeType, bytes: bytes.length, sha256: engineJobSha256(bytes) } }))
      async function admission(db: EngineJobDb) {
        const project = await projectAccess(db, actor, await projectRow(db, body.projectId))
        if (iso(project.updated_at) !== body.sourceRevision)
          throw conflict()
        const existing = (await db.query<Job>('SELECT * FROM banner_engine_jobs WHERE owner_id = $1 AND request_id = $2', [actor.id, body.requestId])).rows[0] as Job | undefined
        if (existing) {
          if (existing.payload_sha256 !== payloadDigest || existing.project_id !== body.projectId)
            throw conflict()
          assertSource(existing, project)
        }
        return { project, existing }
      }
      const first = await deps.transaction(admission)
      if (first.existing)
        return snapshot(first.existing)
      const jobId = randomUUID(), attemptId = randomUUID(), inputId = randomUUID()
      const request = bannerEngineRequestSchema.parse({
        version: 1, jobId, attemptId, ...engineJobSource(first.project), engine: body.engine, operation: 'render-preview',
        input: { id: inputId, bytes: bytes.length, sha256: engineJobSha256(bytes), mimeType: body.input.mimeType },
        output: { mimeType: 'image/png', ...body.output },
        limits: { maxInputBytes: ENGINE_JOB_LIMITS.inputBytes, maxOutputBytes: ENGINE_JOB_LIMITS.outputBytes, maxPixels: ENGINE_JOB_LIMITS.pixels,
          timeoutMs: ENGINE_JOB_LIMITS.timeoutMs, memoryMb: 2048, cpuCount: 2, maxProcesses: 32, maxLogBytes: ENGINE_JOB_LIMITS.controlBytes },
        deadlineAt: new Date(now() + 5 * 60000).toISOString()
      })
      let pin: BannerEngineCapability
      try {
        pin = assertExecutableBannerEngineRequest(request, { capabilities: deps.capabilities, now: now() })
      } catch {
        throw createError({ statusCode: 409, statusMessage: 'Engine capability unavailable' })
      }
      const inputKey = `engine-jobs/${jobId}/input/${inputId}`
      const outputKey = `engine-jobs/${jobId}/${attemptId}/preview.png`
      await deps.storage.put(inputKey, bytes, request.input.mimeType)
      // From here onward, retain objects even on definite failure. Cleanup is a
      // separate reconciliation policy; acknowledgement loss is never deletion authority.
      return deps.transaction(async (db) => {
        const current = await admission(db)
        if (current.existing)
          return snapshot(current.existing)
        if (canonical(engineJobSource(current.project)) !== canonical(engineJobSource(first.project)))
          throw conflict()
        assertExecutableBannerEngineRequest(request, { capabilities: deps.capabilities, now: now() })
        const inserted = await db.query<Job>(`INSERT INTO banner_engine_jobs
          (job_id,attempt_id,owner_id,request_id,payload_sha256,project_id,client_id,project_owner_id,request,capability,input_asset,input_key,output_key,output_asset_id,deadline_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,$15::timestamptz)
          ON CONFLICT (owner_id,request_id) DO NOTHING RETURNING *`, [jobId, attemptId, actor.id, body.requestId, payloadDigest, request.projectId, request.clientId, current.project.created_by,
          JSON.stringify(request), JSON.stringify(pin), JSON.stringify({ ...request.input, projectId: request.projectId, clientId: request.clientId }),
          inputKey, outputKey, engineJobOutputId(attemptId), request.deadlineAt])
        if (inserted.rows[0])
          return snapshot(inserted.rows[0])
        const duplicate = await admission(db)
        if (!duplicate.existing)
          throw conflict()
        return snapshot(duplicate.existing)
      })
    },
    async status(actor: User, jobId: string) {
      return deps.transaction(async db => snapshot(await userJob(db, actor, jobId)))
    },
    async cancel(actor: User, jobId: string, raw: unknown) {
      const body = parseEngineJob(engineJobCancelSchema, raw)
      return deps.transaction(async (db) => {
        let job = await userJob(db, actor, jobId, false)
        if (job.attempt_id !== body.attemptId.toLowerCase())
          throw conflict()
        if (job.status === 'queued')
          job = await state(db, job, 'cancelled', 'cancelled', 'not-started')
        else if (job.status === 'running')
          job = await state(db, job, 'cancelling', 'cancelled', null)
        return snapshot(job)
      })
    },
    async output(actor: User, jobId: string): Promise<Buffer> {
      const job = await deps.transaction(db => userJob(db, actor, jobId))
      if (job.status !== 'succeeded' || !job.result)
        throw conflict()
      const bytes = await deps.storage.get(job.output_key, job.result.output)
      // Recheck current access and saved source after asynchronous private object I/O.
      await deps.transaction(async (db) => {
        const current = await userJob(db, actor, jobId)
        if (current.status !== 'succeeded' || canonical(current.result) !== canonical(job.result))
          throw conflict()
      })
      return bytes
    },
    async service(raw: unknown) {
      const action = parseEngineJob(engineJobServiceActionSchema, raw)
      if (action.action === 'claim') {
        const registrations = deps.capabilities.filter(c => c.engine.id === action.engine.id && c.engine.version === action.engine.version)
        if (!registrations.length)
          throw createError({ statusCode: 409, statusMessage: 'Engine capability unavailable' })
        const token = randomBytes(32).toString('hex')
        return deps.transaction(async (db) => {
          // Bounded opportunistic expiry. Locked/active requests are left for their
          // own expiry check; no expired attempt is ever put back in the queue.
          await db.query(`WITH stale AS (SELECT job_id FROM banner_engine_jobs WHERE status IN ('queued','running','cancelling')
            AND COALESCE(execution_deadline_at,deadline_at) <= clock_timestamp() ORDER BY deadline_at LIMIT 100 FOR UPDATE SKIP LOCKED)
            UPDATE banner_engine_jobs j SET status = CASE WHEN j.status = 'queued' THEN 'expired' ELSE 'uncertain' END,
            failure_code = 'deadline-exceeded', termination = CASE WHEN j.status = 'queued' THEN 'not-started' ELSE 'unconfirmed' END,
            updated_at = clock_timestamp() FROM stale WHERE j.job_id = stale.job_id`)
          const candidate = (await db.query<Job>(`SELECT * FROM banner_engine_jobs WHERE status = 'queued' AND deadline_at > clock_timestamp()
            AND request->'engine'->>'id' = $1 AND request->'engine'->>'version' = $2
            ORDER BY created_at, job_id LIMIT 1 FOR UPDATE SKIP LOCKED`, [action.engine.id, action.engine.version])).rows[0] as Job | undefined
          if (!candidate)
            return { request: null }
          const project = await projectRow(db, candidate.project_id)
          if (!matchesSource(candidate, project)) {
            await state(db, candidate, 'cancelled', 'invalid-request', 'not-started')
            return { request: null }
          }
          try {
            capability(candidate)
          } catch {
            await state(db, candidate, 'failed', 'unsupported-capability', 'not-started')
            return { request: null }
          }
          const claimed = await db.query<Job>(`UPDATE banner_engine_jobs SET status = 'running', claim_token_sha256 = $2,
            claimed_at = clock_timestamp(), execution_deadline_at = LEAST(deadline_at, clock_timestamp() + (request->'limits'->>'timeoutMs')::integer * interval '1 millisecond'),
            updated_at = clock_timestamp() WHERE job_id = $1 AND status = 'queued' AND deadline_at > clock_timestamp() RETURNING *`, [candidate.job_id, engineJobSha256(token)])
          if (!claimed.rows[0])
            return { request: null }
          return { request: claimed.rows[0].request as BannerEngineRequest, claimToken: token }
        })
      }
      if (action.action === 'status') {
        return deps.transaction(async db => ({ status: (await serviceJob(db, action)).job.status }))
      }
      if (action.action === 'fail') {
        return deps.transaction(async (db) => {
          const { job } = await serviceJob(db, action)
          if (!['running', 'cancelling'].includes(job.status))
            return { status: job.status }
          // A duplicate local attempt or failed durable receipt is ambiguous even
          // if this invocation itself did not start a process.
          const uncertain = action.termination === 'unconfirmed' || ['duplicate-attempt', 'receipt-failed', 'transport-failed'].includes(action.code)
          const status = uncertain ? 'uncertain' : job.status === 'cancelling' ? 'cancelled' : 'failed'
          return { status: (await state(db, job, status, action.code, action.termination)).status }
        })
      }
      const first = await running(action)
      if (action.action === 'input') {
        const bytes = await deps.storage.get(first.job.input_key, first.job.input_asset)
        await running(action)
        return { base64: bytes.toString('base64') }
      }
      const inputBytes = await deps.storage.get(first.job.input_key, first.job.input_asset)
      let validated: ReturnType<typeof validateBannerEngineResult>
      try {
        validated = validateBannerEngineResult({ result: action.result, request: first.job.request,
          currentSource: engineJobSource(first.project), inputAsset: first.job.input_asset, inputBytes,
          outputAssetId: first.job.output_asset_id, outputBytes: Buffer.from(action.outputBase64, 'base64'), capabilities: deps.capabilities, now: now() })
      } catch {
        throw conflict()
      }
      await deps.storage.put(first.job.output_key, validated.outputBytes, 'image/png')
      // Final authority lock occurs AFTER I/O, so concurrent cancellation is never
      // hidden behind a long upload transaction. Both rows remain locked through COMMIT.
      const accepted = await deps.transaction(async (db) => {
        const current = await serviceJob(db, action)
        if (current.job.status !== 'running' || !matchesSource(current.job, current.project))
          return false
        try {
          capability(current.job)
        } catch {
          return false
        }
        const result = await db.query<Job>(`UPDATE banner_engine_jobs SET status = 'succeeded', result = $2::jsonb,
          termination = 'adapter-settled', updated_at = clock_timestamp()
          WHERE job_id = $1 AND status = 'running' AND attempt_id = $3 AND claim_token_sha256 = $4
          AND execution_deadline_at > clock_timestamp() AND deadline_at > clock_timestamp() RETURNING *`, [current.job.job_id, JSON.stringify(validated.result), current.job.attempt_id, engineJobSha256(action.claimToken)])
        return !!result.rows[0]
      })
      if (!accepted)
        throw conflict()
      return { status: 'succeeded' as const }
    }
  }
}
/** Production dependency composition; the factory also supports owned local SQL proof. */
export function engineJobAuthority(event: H3Event) {
  const config = engineJobConfig(event)
  return createEngineJobAuthority({ transaction: transactionWithoutRetry, capabilities: config.capabilities, storage: createEngineJobStorage(config.bucket) })
}
