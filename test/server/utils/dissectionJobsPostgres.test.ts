import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { readFile, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FORMATS } from '../../../shared/bannerFormats'

// Only the owned-cluster runner opts in. A normal test run cannot touch a database.
const enabled = !!process.env.BANNER_JOBS_PROOF_URL
const transport = vi.hoisted(() => ({
  pool: null as pg.Pool | null,
  fault: null as { when: 'before' | 'after', matches: string } | null
}))
const boundary = vi.hoisted(() => ({ analyze: vi.fn(), segment: vi.fn(), upload: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: async (event: { user?: string }) => ({ id: event.user || '11111111-1111-4111-8111-111111111111' }) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  hasAllSocialClientAccess: () => false,
  requireSocialClientAccess: async () => { throw Object.assign(new Error('Synthetic client access denied'), { statusCode: 403 }) }
}))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.stubGlobal('getRouterParam', (event: { jobId: string }) => event.jobId)
vi.stubGlobal('readMultipartFormData', async () => [{ name: 'file', type: 'image/png', data: Buffer.from('synthetic image') }])
vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: class { constructor(readonly input: unknown) {} },
  S3Client: class {
    async send() {
      return { Body: (async function* () {
        yield Buffer.from('synthetic image')
      })() }
    }
  }
}))
vi.mock('~~/server/utils/storage', () => ({ uploadFile: boundary.upload }))
vi.mock('~~/server/utils/bannerDissector', () => ({
  analyzeImage: boundary.analyze, segmentLayer: boundary.segment,
  getImageDimensions: () => ({ width: 300, height: 250 })
}))
vi.mock('~~/server/utils/db', () => {
  const rows = async (sql: string, values?: unknown[]) => {
    const fault = transport.fault && sql.includes(transport.fault.matches) ? transport.fault : null
    if (fault) transport.fault = null
    if (fault?.when === 'before') throw new Error('Synthetic lost connection before SQL commit')
    const result = (await transport.pool!.query(sql, values)).rows
    if (fault?.when === 'after') throw new Error('Synthetic lost acknowledgement after SQL commit')
    return result
  }
  const one = async (sql: string, values?: unknown[]) => (await rows(sql, values))[0] || null
  const transaction = async (callback: (client: pg.PoolClient) => Promise<unknown>) => {
    const client = await transport.pool!.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
  return {
    queryOne: one, queryOneFresh: one, queryRows: rows, queryRowsFresh: rows,
    query: rows, queryFresh: rows,
    execute: async (sql: string, values?: unknown[]) => (await transport.pool!.query(sql, values)).rowCount,
    transaction, transactionOnce: transaction, transactionWithoutRetry: transaction
  }
})

const jobs = await import('../../../server/utils/banner/dissectionJobs')
const { runDissectionPipeline } = await import('../../../server/utils/bannerDissectorPipeline')
const { dispatchDissection } = await import('../../../server/utils/banner/dissectionDispatch')
const { recoverDissectionDispatches } = await import('../../../server/utils/banner/dissectionRecovery')
const { processJob } = await import('../../../server/utils/queueConsumer')
const ledger = await import('../../../server/utils/jobExecutionLedger')
const processDissection = (await import('../../../server/api/agency/banner-studio/dissect/process.post')).default
const uploadDissection = (await import('../../../server/api/agency/banner-studio/dissect/upload.post')).default
const recoverEndpoint = (await import('../../../server/api/cron/banner-dissection-recovery.post')).default
const importJob = (await import('../../../server/api/agency/banner-studio/dissect/[jobId]/import.post')).default
const owner = '11111111-1111-4111-8111-111111111111'
const outsider = '22222222-2222-4222-8222-222222222222'
const sql = async (query: string, values?: unknown[]) => transport.pool!.query(query, values)
async function queued() {
  const id = randomUUID()
  const manifest = jobs.queuedDissectionManifest()
  await sql(`INSERT INTO banner_dissections (job_id, user_id, source_r2_key, status, manifest)
    VALUES ($1, $2, $4, 'queued', $3::jsonb)`, [id, owner, JSON.stringify(manifest), `banner-dissector/${id}/original.png`])
  return { id, manifest }
}
async function complete() {
  const job = await queued()
  const claim = (await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId }))!
  const saved = (await jobs.writeDissectionAttempt(job.id, claim.manifest!.execution!, 'complete', {
    tokens: { copy: { id: 'copy', type: 'cta_label', value: 'Synthetic copy', editable: true, required: true, affects_layers: ['text'] } },
    layers: [{ id: 'text', type: 'live_text', description: 'Synthetic text', extraction_status: 'extracted',
      token_bindings: ['copy'], region: { x: 0, y: 0, width: 1, height: 1 }, z_index: 1, editable: true, export_as_png: false }]
  }))!
  return { ...job, expectedResultId: saved.manifest!.execution!.resultId! }
}
function importEvent(jobId: string, body: Record<string, unknown>, user = owner) {
  return { jobId, body, user } as never
}
type TransportJob = Parameters<typeof ledger.startJobExecution>[0]
function queueEvent(send: (job: TransportJob) => Promise<void>) {
  return { context: { cloudflare: { env: { JOBS_QUEUE: { send } } } } } as never
}
async function rawJob(jobId: string) {
  return (await sql('SELECT * FROM banner_dissections WHERE job_id = $1', [jobId])).rows[0]
}
// Move only synthetic persisted clocks; do not sleep or change the global clock.
async function makeDispatchDue(jobId: string) {
  await sql(`UPDATE banner_dissections SET manifest = jsonb_set(manifest, '{execution,dispatch}',
    manifest->'execution'->'dispatch' || jsonb_build_object(
      'leaseUntil', (clock_timestamp() - interval '1 second')::text,
      'nextAttemptAt', (clock_timestamp() - interval '1 second')::text)) WHERE job_id = $1`, [jobId])
}

describe.skipIf(!enabled)('Dissection jobs: actual SQL in an owned local PostgreSQL cluster', () => {
  beforeAll(async () => {
    const url = new URL(process.env.BANNER_JOBS_PROOF_URL!)
    const markerPath = process.env.BANNER_JOBS_PROOF_OWNER
    if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || Number(url.port) < 1024
      || url.username !== 'proof_owner' || url.password || url.search || !markerPath
      || !process.env.BANNER_JOBS_PROOF_TOKEN) throw new Error('Refusing a non-owned proof database')
    const owned = await realpath(dirname(markerPath))
    const temporary = await realpath('/tmp')
    if (dirname(owned) !== temporary || !owned.startsWith(join(temporary, 'banner-jobs-proof-')))
      throw new Error('Proof ownership marker must be inside the runner temporary directory')
    const marker = JSON.parse(await readFile(markerPath, 'utf8'))
    if (marker.token !== process.env.BANNER_JOBS_PROOF_TOKEN || marker.port !== Number(url.port)
      || url.pathname !== `/${marker.database}` || !/^banner_jobs_proof_[a-f0-9]{32}$/.test(marker.database)
      || marker.data !== join(owned, 'data')) throw new Error('Proof cluster identity mismatch')
    transport.pool = new pg.Pool({ connectionString: url.toString(), max: 16, connectionTimeoutMillis: 3000 })
    const identity = (await sql(`SELECT current_database() AS database, current_setting('data_directory') AS directory`)).rows[0]
    if (identity.database !== marker.database || await realpath(identity.directory) !== await realpath(marker.data))
      throw new Error('Connected cluster does not belong to this proof runner')
    await sql(`CREATE TABLE team_members (id uuid PRIMARY KEY);
      CREATE TABLE agency_clients (id uuid PRIMARY KEY);
      CREATE TABLE banner_projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text,
        canvas_data jsonb DEFAULT '{}'::jsonb, tags text[], created_by uuid REFERENCES team_members(id),
        client_id uuid, updated_at timestamptz DEFAULT clock_timestamp()
      )`)
    // Execute the actual existing migration only in this newly created owned database.
    await sql(await readFile(new URL('../../../server/database/migrations/034-banner-dissector.sql', import.meta.url), 'utf8'))
    await sql(await readFile(new URL('../../../server/database/migrations/300_platform_job_execution_observability.sql', import.meta.url), 'utf8'))
    await sql(await readFile(new URL('../../../server/database/migrations/305_platform_job_lifecycle.sql', import.meta.url), 'utf8'))
  })
  afterAll(async () => {
    await transport.pool?.end()
    transport.pool = null
    vi.unstubAllEnvs()
  })
  beforeEach(async () => {
    vi.resetAllMocks()
    transport.fault = null
    vi.stubEnv('R2_ACCOUNT_ID', 'synthetic')
    vi.stubEnv('R2_ACCESS_KEY_ID', 'synthetic')
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'synthetic')
    await sql('TRUNCATE banner_dissections, banner_projects, team_members, platform_jobs, platform_job_executions CASCADE')
    await sql('INSERT INTO team_members (id) VALUES ($1), ($2)', [owner, outsider])
  })

  it('allows only one simultaneous queued-generation claim and rejects duplicate delivery', async () => {
    const job = await queued()
    const claims = await Promise.all(Array.from({ length: 12 }, () => jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId })))
    expect(claims.filter(Boolean)).toHaveLength(1)
    expect(claims.find(Boolean)!.manifest!.execution).toMatchObject({ attempt: 1, attemptId: job.manifest.execution.attemptId })
    expect(await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId })).toBeNull()
  })

  it('cancellation wins before a pending completion and prevents later stage writes', async () => {
    const job = await queued()
    const claim = (await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId }))!
    expect(await jobs.isDissectionAttemptActive(job.id, claim.manifest!.execution!.attemptId)).toBe(true)
    await jobs.cancelDissection(job.id, owner)
    expect(await jobs.writeDissectionAttempt(job.id, claim.manifest!.execution!, 'complete', { layers: [] })).toBeNull()
    expect(await jobs.writeDissectionAttempt(job.id, claim.manifest!.execution!, 'segmenting')).toBeNull()
    expect(await jobs.isDissectionAttemptActive(job.id, claim.manifest!.execution!.attemptId)).toBe(false)
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('cancelled')
  })

  it('reserves one queued retry generation under concurrency and enforces owner, generation and attempt bounds', async () => {
    const job = await queued()
    const first = (await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId }))!
    await jobs.writeDissectionAttempt(job.id, first.manifest!.execution!, 'failed')
    expect(await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId })).toBeNull()
    expect(await jobs.prepareDissectionRetry(job.id, outsider, job.manifest.execution.attemptId)).toBeNull()
    expect(await jobs.prepareDissectionRetry(job.id, owner, randomUUID())).toBeNull()
    const retries = await Promise.all(Array.from({ length: 12 }, () => jobs.prepareDissectionRetry(job.id, owner, job.manifest.execution.attemptId)))
    expect(retries.filter(Boolean)).toHaveLength(1)
    const second = retries.find(Boolean)!
    const execution = second.manifest!.execution!
    expect(second.status).toBe('queued')
    expect(execution).toMatchObject({ attempt: 2, stage: 'queued', startedAt: null })
    expect(execution.attemptId).not.toBe(job.manifest.execution.attemptId)
    expect(await jobs.claimDissectionAttempt(job.id)).toBeNull()
    expect(await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId })).toBeNull()
    expect(await jobs.writeDissectionAttempt(job.id, first.manifest!.execution!, 'complete', { layers: [] })).toBeNull()
    expect(await jobs.writeDissectionAttempt(job.id, execution, 'complete', { layers: [] })).toBeNull()
    const claimed = (await jobs.claimDissectionAttempt(job.id, { attemptId: execution.attemptId }))!
    expect(claimed.manifest!.execution).toMatchObject({ attempt: 2, attemptId: execution.attemptId, deadlineAt: execution.deadlineAt })
    await jobs.writeDissectionAttempt(job.id, claimed.manifest!.execution!, 'failed')
    // A delayed duplicate HTTP retry must not turn the now-failed second attempt into a third.
    expect(await jobs.prepareDissectionRetry(job.id, owner, job.manifest.execution.attemptId)).toBeNull()
    const third = (await jobs.prepareDissectionRetry(job.id, owner, execution.attemptId))!
    expect(third.manifest!.execution!.attempt).toBe(3)
    const thirdClaim = (await jobs.claimDissectionAttempt(job.id, { attemptId: third.manifest!.execution!.attemptId }))!
    await jobs.writeDissectionAttempt(job.id, thirdClaim.manifest!.execution!, 'failed')
    expect(await jobs.prepareDissectionRetry(job.id, owner, third.manifest!.execution!.attemptId)).toBeNull()
  })

  it('does not let another owner read, cancel or claim the job', async () => {
    const job = await queued()
    await expect(jobs.loadDissection(job.id, outsider)).rejects.toMatchObject({ statusCode: 404 })
    await expect(jobs.cancelDissection(job.id, outsider)).rejects.toMatchObject({ statusCode: 404 })
    expect(await jobs.claimDissectionAttempt(job.id, { userId: outsider, attemptId: job.manifest.execution.attemptId })).toBeNull()
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('queued')
  })

  it('admits one concurrent dispatch lease and permits a replacement generation separately', async () => {
    const job = await queued()
    expect(await jobs.reserveDissectionDispatch(job.id, randomUUID())).toBeNull()
    const admissions = await Promise.all(Array.from({ length: 12 }, () => jobs.reserveDissectionDispatch(job.id, job.manifest.execution.attemptId)))
    expect(admissions.filter(Boolean)).toHaveLength(1)
    expect(admissions.find(Boolean)!.manifest!.execution).toMatchObject({ dispatch: { state: 'leased', sendCount: 1 }, attempt: 1 })
    await jobs.cancelDissection(job.id, owner)
    expect(await jobs.reserveDissectionDispatch(job.id, job.manifest.execution.attemptId)).toBeNull()
    const retry = (await jobs.prepareDissectionRetry(job.id, owner, job.manifest.execution.attemptId))!
    expect(await jobs.reserveDissectionDispatch(job.id, job.manifest.execution.attemptId)).toBeNull()
    const retryAdmissions = await Promise.all(Array.from({ length: 12 }, () => jobs.reserveDissectionDispatch(job.id, retry.manifest!.execution!.attemptId)))
    expect(retryAdmissions.filter(Boolean)).toHaveLength(1)
  })

  it('reserves a legacy failed job once without relying on missing execution metadata', async () => {
    const job = await queued()
    await sql(`UPDATE banner_dissections SET status = 'failed', manifest = NULL WHERE job_id = $1`, [job.id])
    const snapshot = jobs.dissectionSnapshot(await jobs.loadDissection(job.id, owner))
    expect(snapshot.execution).toMatchObject({ attemptId: `legacy:${job.id}`, attempt: 1, maxAttempts: 3 })
    const retries = await Promise.all(Array.from({ length: 12 }, () => jobs.prepareDissectionRetry(job.id, owner, snapshot.execution!.attemptId)))
    expect(retries.filter(Boolean)).toHaveLength(1)
    expect(retries.find(Boolean)!.manifest!.execution).toMatchObject({ stage: 'queued', attempt: 2 })
    expect(await jobs.prepareDissectionRetry(job.id, owner, snapshot.execution!.attemptId)).toBeNull()
  })

  it('returns concurrent retry HTTP admissions before providers and sends one generation through the real dispatcher', async () => {
    const job = await queued()
    await jobs.cancelDissection(job.id, owner)
    const sent: Array<Parameters<typeof processJob>[0]> = []
    const send = vi.fn(async (message: Parameters<typeof processJob>[0]) => {
      sent.push(message)
    })
    const request = { user: owner, context: { cloudflare: { env: { JOBS_QUEUE: { send } } } },
      body: { jobId: job.id, retry: true, expectedAttemptId: job.manifest.execution.attemptId } }
    const results = await Promise.all(Array.from({ length: 12 }, () => processDissection(request as never)))
    expect(results.every(result => result.status === 'queued')).toBe(true)
    expect(new Set(results.map(result => result.execution!.attemptId)).size).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(boundary.analyze).not.toHaveBeenCalled()
    expect((await sql('SELECT status, dispatch_mode FROM platform_jobs')).rows).toEqual([{ status: 'queued', dispatch_mode: 'queue' }])
    let release!: (value: unknown) => void
    let arrived!: () => void
    const arrivedAtProvider = new Promise<void>((resolve) => {
      arrived = resolve
    })
    boundary.analyze.mockImplementation(() => {
      arrived()
      return new Promise((resolve) => {
        release = resolve
      })
    })
    const delivery = processJob(sent[0]!)
    await arrivedAtProvider
    await Promise.all(Array.from({ length: 12 }, () => processJob(sent[0]!)))
    expect(boundary.analyze).toHaveBeenCalledTimes(1)
    await jobs.cancelDissection(job.id, owner)
    release({ tokens: {}, layers: [], warnings: [] })
    await delivery
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('cancelled')
  })

  it('returns while a lifecycle-bound inline provider is pending and honors cancellation before it finishes', async () => {
    const job = await queued()
    const retained: Promise<unknown>[] = []
    let release!: (value: unknown) => void
    let arrived!: () => void
    const arrivedAtProvider = new Promise<void>((resolve) => {
      arrived = resolve
    })
    boundary.analyze.mockImplementation(() => {
      arrived()
      return new Promise((resolve) => {
        release = resolve
      })
    })
    const event = { context: {}, path: '/', node: { req: { url: '/', headers: { host: 'localhost' } } }, waitUntil: (promise: Promise<unknown>) => {
      retained.push(promise)
    } }
    await dispatchDissection(event as never, job.id, job.manifest.execution.attemptId)
    expect(retained).toHaveLength(1)
    await arrivedAtProvider
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('analyzing')
    await jobs.cancelDissection(job.id, owner)
    release({ tokens: {}, layers: [], warnings: [] })
    await Promise.all(retained)
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('cancelled')
    expect(boundary.analyze).toHaveBeenCalledTimes(1)
    expect(boundary.upload).not.toHaveBeenCalled()
    expect((await sql('SELECT dispatch_mode, attempt_count FROM platform_jobs')).rows).toEqual([{ dispatch_mode: 'inline', attempt_count: 1 }])
  })

  it('does not regress a completed consumer or its ledger when queue send later rejects ambiguously', async () => {
    const job = await queued()
    const event = { context: { cloudflare: { env: { JOBS_QUEUE: { send: async (message: Parameters<typeof ledger.startJobExecution>[0]) => {
      const handle = await ledger.startJobExecution(message, { queueAttempt: 1, maxAttempts: 1, retryDelaySeconds: 0 })
      const claim = (await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId }))!
      await jobs.writeDissectionAttempt(job.id, claim.manifest!.execution!, 'complete', { tokens: {}, layers: [] })
      await ledger.finishJobExecution(handle, 'succeeded', Date.now())
      throw new Error('Synthetic acknowledgement lost after delivery')
    } } } } }, waitUntil: vi.fn() }
    await dispatchDissection(event as never, job.id, job.manifest.execution.attemptId)
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('complete')
    expect((await sql('SELECT status FROM platform_jobs')).rows).toEqual([{ status: 'succeeded' }])
    expect(event.waitUntil).not.toHaveBeenCalled()
    expect(boundary.analyze).not.toHaveBeenCalled()
  })

  it('retains an uncertain send for same-generation recovery without launching inline work', async () => {
    const job = await queued()
    const waitUntil = vi.fn()
    let sent!: Parameters<typeof processJob>[0]
    const send = vi.fn(async (message: Parameters<typeof processJob>[0]) => {
      sent = message
      throw new Error('Synthetic queue acknowledgement lost')
    })
    await dispatchDissection({ context: { cloudflare: { env: { JOBS_QUEUE: { send } } } }, waitUntil } as never, job.id, job.manifest.execution.attemptId)
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('queued')
    expect((await rawJob(job.id)).manifest.execution.dispatch.state).toBe('uncertain')
    expect(waitUntil).not.toHaveBeenCalled()
    expect(boundary.analyze).not.toHaveBeenCalled()
    expect(await jobs.prepareDissectionRetry(job.id, owner, job.manifest.execution.attemptId)).toBeNull()
    // Cancellation remains authoritative even when the first send was accepted late.
    await jobs.cancelDissection(job.id, owner)
    await processJob(sent)
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('cancelled')
    expect(boundary.analyze).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    // Queue acknowledgement remains unknown; a fabricated ledger failure would be misleading.
    expect((await sql('SELECT status FROM platform_jobs')).rows).toEqual([{ status: 'queued' }])
  })

  it('starts no provider when lifetime support is absent or rejects registration', async () => {
    for (const event of [
      { context: {} },
      { context: {}, path: '/', node: { req: { url: '/', headers: { host: 'localhost' } } }, waitUntil: () => { throw new Error('Synthetic lifecycle unavailable') } }
    ]) {
      const job = await queued()
      await dispatchDissection(event as never, job.id, job.manifest.execution.attemptId)
      expect((await jobs.loadDissection(job.id, owner)).status).toBe('failed')
      expect(await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId })).toBeNull()
    }
    expect(boundary.analyze).not.toHaveBeenCalled()
    expect((await sql('SELECT count(*)::int AS count FROM platform_job_executions')).rows[0].count).toBe(0)
  })

  it('persists initial and retry dispatch intent atomically with each queued generation', async () => {
    const job = await queued()
    const first = (await rawJob(job.id)).manifest.execution
    expect(first.dispatch).toMatchObject({ version: 1, state: 'pending', sendCount: 0 })
    expect(first.dispatch.deliveryId).toMatch(/^[a-f0-9-]{36}$/)
    expect(Date.parse(first.dispatch.nextAttemptAt)).toBeLessThanOrEqual(Date.now())
    await jobs.cancelDissection(job.id, owner)
    const retry = (await jobs.prepareDissectionRetry(job.id, owner, first.attemptId))!
    const saved = (await rawJob(job.id)).manifest.execution
    expect(saved).toEqual(retry.manifest!.execution)
    expect(saved).toMatchObject({ attempt: 2, dispatch: { version: 1, state: 'pending', sendCount: 0 } })
    expect(saved.dispatch.deliveryId).not.toBe(first.dispatch.deliveryId)
    expect(saved.attemptId).not.toBe(first.attemptId)
    expect(boundary.analyze).not.toHaveBeenCalled()
  })

  it('uses database clocks for actual upload and retry admission despite a skewed application clock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'))
    try {
      const send = vi.fn(async () => {})
      boundary.upload.mockResolvedValue({ url: 'https://fixture.invalid/source.png' })
      const response = await uploadDissection(queueEvent(send))
      expect(response.status).toBe('queued')
      expect(response.execution).toMatchObject({ attempt: 1, dispatch: { state: 'acknowledged', sendCount: 1 } })
      expect(send).toHaveBeenCalledTimes(1)
      await jobs.cancelDissection(response.jobId, owner)
      const retry = (await jobs.prepareDissectionRetry(response.jobId, owner, response.execution.attemptId))!
      expect(retry.manifest!.execution).toMatchObject({ attempt: 2, dispatch: { state: 'pending', sendCount: 0 } })
      const clocks = (await sql(`SELECT
        EXTRACT(EPOCH FROM ((manifest->'execution'->>'deadlineAt')::timestamptz - clock_timestamp()))::float AS remaining,
        EXTRACT(EPOCH FROM (clock_timestamp() - (manifest->'execution'->'dispatch'->>'nextAttemptAt')::timestamptz))::float AS due
        FROM banner_dissections WHERE job_id = $1`, [response.jobId])).rows[0]
      expect(clocks.remaining).toBeGreaterThan(595)
      expect(clocks.remaining).toBeLessThanOrEqual(600)
      expect(clocks.due).toBeGreaterThanOrEqual(0)
      expect(clocks.due).toBeLessThan(5)
      expect(boundary.analyze).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it('authenticates the actual default-off cron and returns only aggregates after explicit activation', async () => {
    const job = await queued()
    const send = vi.fn(async () => {})
    vi.stubEnv('CRON_SECRET', 'synthetic-local-secret')
    vi.stubEnv('BANNER_DISSECTION_RECOVERY_ENABLED', 'true')
    const request = (secret: string, env: Record<string, unknown>) => ({
      context: { cloudflare: { env } }, node: { req: { headers: { 'x-cron-secret': secret } } }
    }) as never
    const bindings = { CRON_SECRET: 'synthetic-binding-secret', BANNER_DISSECTION_RECOVERY_ENABLED: 'false', JOBS_QUEUE: { send } }
    const before = await rawJob(job.id)
    await expect(recoverEndpoint(request('synthetic-local-secret', bindings))).rejects.toMatchObject({ statusCode: 401 })
    expect(await recoverEndpoint(request('synthetic-binding-secret', bindings))).toEqual({ ran: false, reason: 'disabled' })
    expect(await rawJob(job.id)).toEqual(before)
    expect(send).not.toHaveBeenCalled()
    expect(await recoverEndpoint(request('synthetic-binding-secret', { ...bindings, JOBS_QUEUE: undefined, BANNER_DISSECTION_RECOVERY_ENABLED: 'true' })))
      .toEqual({ ran: false, reason: 'queue_unavailable' })
    expect(await rawJob(job.id)).toEqual(before)
    const result = await recoverEndpoint(request('synthetic-binding-secret', { ...bindings, BANNER_DISSECTION_RECOVERY_ENABLED: 'true' }))
    expect(result).toEqual({ ran: true, expired: 0, leased: 1, acknowledged: 1, uncertain: 0 })
    expect(JSON.stringify(result)).not.toContain(job.id)
    expect(send).toHaveBeenCalledTimes(1)
    expect(boundary.analyze).not.toHaveBeenCalled()
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('BANNER_DISSECTION_RECOVERY_ENABLED', '')
  })

  it('recovers a committed intent after crash before dispatch and one expired lease after crash before send', async () => {
    const pending = await queued()
    const reserved = await queued()
    const original = reserved.manifest.execution
    const lease = (await jobs.reserveDissectionDispatch(reserved.id, original.attemptId))!
    expect(lease.manifest!.execution!.dispatch!.sendCount).toBe(1)
    const messages: TransportJob[] = []
    const event = queueEvent(async (message) => {
      messages.push(message)
    })
    await recoverDissectionDispatches(event)
    expect(messages.map(message => message.payload.jobId)).toEqual([pending.id])
    // A process died after durable lease reservation but before queue.send.
    await makeDispatchDue(reserved.id)
    await recoverDissectionDispatches(event)
    expect(messages.filter(message => message.payload.jobId === reserved.id)).toHaveLength(1)
    const current = (await rawJob(reserved.id)).manifest.execution
    expect(current).toMatchObject({ attemptId: original.attemptId, attempt: 1, deadlineAt: original.deadlineAt,
      dispatch: { deliveryId: original.dispatch.deliveryId, sendCount: 2, state: 'acknowledged' } })
    expect(current.dispatch.leaseToken).not.toBe(lease.manifest!.execution!.dispatch!.leaseToken)
    expect(boundary.analyze).not.toHaveBeenCalled()
  })

  it('recovers a committed lease whose database acknowledgement was lost without immediately resending', async () => {
    const job = await queued()
    const send = vi.fn(async () => {})
    const event = queueEvent(send)
    transport.fault = { when: 'after', matches: '\'leaseToken\', gen_random_uuid()' }
    await expect(dispatchDissection(event, job.id, job.manifest.execution.attemptId)).rejects.toMatchObject({ statusCode: 503 })
    expect(transport.fault).toBeNull()
    expect((await rawJob(job.id)).manifest.execution.dispatch).toMatchObject({ state: 'leased', sendCount: 1 })
    await recoverDissectionDispatches(event)
    expect(send).not.toHaveBeenCalled()
    await makeDispatchDue(job.id)
    await recoverDissectionDispatches(event)
    expect(send).toHaveBeenCalledTimes(1)
    expect((await rawJob(job.id)).manifest.execution).toMatchObject({ attempt: 1,
      attemptId: job.manifest.execution.attemptId, dispatch: { state: 'acknowledged', sendCount: 2 } })
    expect(boundary.analyze).not.toHaveBeenCalled()
  })

  it.each(['before', 'after'] as const)('recovers dispatch acknowledgement connection loss %s its SQL commit', async (when) => {
    const job = await queued()
    const send = vi.fn(async () => {})
    const event = queueEvent(send)
    transport.fault = { when, matches: '\'acknowledgedAt\', CASE' }
    await dispatchDissection(event, job.id, job.manifest.execution.attemptId)
    expect(transport.fault).toBeNull()
    expect(send).toHaveBeenCalledTimes(1)
    expect((await rawJob(job.id)).manifest.execution.dispatch.state).toBe(when === 'before' ? 'leased' : 'acknowledged')
    await recoverDissectionDispatches(event)
    expect(send).toHaveBeenCalledTimes(1)
    await makeDispatchDue(job.id)
    await recoverDissectionDispatches(event)
    expect(send).toHaveBeenCalledTimes(2)
    expect((await rawJob(job.id)).manifest.execution).toMatchObject({ attempt: 1,
      attemptId: job.manifest.execution.attemptId, dispatch: { state: 'acknowledged', sendCount: 2 } })
    expect(boundary.analyze).not.toHaveBeenCalled()
  })

  it('redelivers a lost send acknowledgement with one provider claim across both deliveries', async () => {
    const job = await queued()
    const messages: TransportJob[] = []
    await dispatchDissection(queueEvent(async (message) => {
      messages.push(message)
      throw new Error('Synthetic accepted send with lost acknowledgement')
    }), job.id, job.manifest.execution.attemptId)
    const uncertain = (await rawJob(job.id)).manifest.execution
    expect(uncertain).toMatchObject({ attempt: 1, dispatch: { state: 'uncertain', sendCount: 1 } })
    const event = queueEvent(async (message) => {
      messages.push(message)
    })
    await recoverDissectionDispatches(event)
    expect(messages).toHaveLength(1)
    await makeDispatchDue(job.id)
    await Promise.all(Array.from({ length: 12 }, () => recoverDissectionDispatches(event)))
    expect(messages).toHaveLength(2)
    expect(new Set(messages.map(message => message.jobId)).size).toBe(2)
    expect(messages.every(message => message.payload.attemptId === job.manifest.execution.attemptId)).toBe(true)
    boundary.analyze.mockResolvedValue({ tokens: {}, layers: [] })
    await Promise.all(messages.flatMap(message => Array.from({ length: 6 }, () => processJob(message))))
    expect(boundary.analyze).toHaveBeenCalledTimes(1)
    expect((await rawJob(job.id)).status).toBe('review_ready')
    expect((await rawJob(job.id)).manifest.execution.attempt).toBe(1)
  })

  it('recovers an accepted-but-undelivered message only after its persisted redelivery time', async () => {
    const job = await queued()
    const messages: TransportJob[] = []
    const event = queueEvent(async (message) => {
      messages.push(message)
    })
    await dispatchDissection(event, job.id, job.manifest.execution.attemptId)
    expect((await rawJob(job.id)).manifest.execution.dispatch.state).toBe('acknowledged')
    await recoverDissectionDispatches(event)
    expect(messages).toHaveLength(1)
    await makeDispatchDue(job.id)
    await recoverDissectionDispatches(event)
    expect(messages).toHaveLength(2)
    expect(messages[1]!.payload).toEqual(messages[0]!.payload)
    expect(messages[1]!.jobId).not.toBe(messages[0]!.jobId)
    expect((await rawJob(job.id)).manifest.execution.attempt).toBe(1)
  })

  it('preserves completion and succeeded transport ledger after crash before dispatch acknowledgement', async () => {
    const job = await queued()
    const lease = (await jobs.reserveDissectionDispatch(job.id, job.manifest.execution.attemptId))!
    const execution = lease.manifest!.execution!
    const message: TransportJob = { jobId: execution.dispatch!.leaseToken!, type: 'dissect.analyze',
      payload: { jobId: job.id, attemptId: execution.attemptId }, enqueuedAt: new Date().toISOString() }
    await ledger.recordJobQueued(message, 'queue')
    const handle = await ledger.startJobExecution(message, { queueAttempt: 1, maxAttempts: 1, retryDelaySeconds: 0 })
    const claim = (await jobs.claimDissectionAttempt(job.id, { attemptId: execution.attemptId }))!
    await jobs.writeDissectionAttempt(job.id, claim.manifest!.execution!, 'complete', { tokens: {}, layers: [] })
    await ledger.finishJobExecution(handle, 'succeeded', Date.now())
    // No acknowledgement: the producer disappeared after the consumer committed success.
    const before = await rawJob(job.id)
    const ledgerBefore = (await sql('SELECT * FROM platform_jobs WHERE id = $1', [message.jobId])).rows[0]
    const send = vi.fn()
    await Promise.all(Array.from({ length: 12 }, () => recoverDissectionDispatches(queueEvent(send))))
    expect(await jobs.acknowledgeDissectionDispatch(job.id, execution.attemptId, execution.dispatch!.leaseToken!, false)).toBeNull()
    expect(await rawJob(job.id)).toEqual(before)
    expect((await sql('SELECT * FROM platform_jobs WHERE id = $1', [message.jobId])).rows[0]).toEqual(ledgerBefore)
    expect(send).not.toHaveBeenCalled()
    expect(boundary.analyze).not.toHaveBeenCalled()
  })

  it('partitions concurrent bounded scheduler batches without duplicate leases or sends', async () => {
    const records = await Promise.all(Array.from({ length: 17 }, () => queued()))
    const messages: TransportJob[] = []
    const event = queueEvent(async (message) => {
      messages.push(message)
    })
    await Promise.all(Array.from({ length: 12 }, () => recoverDissectionDispatches(event, { limit: 3 })))
    expect(messages).toHaveLength(records.length)
    expect(new Set(messages.map(message => message.payload.jobId)).size).toBe(records.length)
    expect(new Set(messages.map(message => message.jobId)).size).toBe(records.length)
    for (const record of records) {
      expect((await rawJob(record.id)).manifest.execution).toMatchObject({ attempt: 1,
        dispatch: { state: 'acknowledged', sendCount: 1 } })
    }
    await recoverDissectionDispatches(event)
    expect(messages).toHaveLength(records.length)
    expect(boundary.analyze).not.toHaveBeenCalled()
  })

  it('fences stale acknowledgements by lease token, lease expiry and provider generation', async () => {
    const job = await queued()
    const first = (await jobs.reserveDissectionDispatch(job.id, job.manifest.execution.attemptId))!.manifest!.execution!
    await makeDispatchDue(job.id)
    // A matching token whose lease already expired cannot acknowledge late.
    const expired = await rawJob(job.id)
    expect(await jobs.acknowledgeDissectionDispatch(job.id, first.attemptId, first.dispatch!.leaseToken!, true)).toBeNull()
    expect(await rawJob(job.id)).toEqual(expired)
    const second = (await jobs.reserveDissectionDispatch(job.id, first.attemptId))!.manifest!.execution!
    expect(second.dispatch!.leaseToken).not.toBe(first.dispatch!.leaseToken)
    const current = await rawJob(job.id)
    for (const accepted of [true, false]) {
      expect(await jobs.acknowledgeDissectionDispatch(job.id, first.attemptId, first.dispatch!.leaseToken!, accepted)).toBeNull()
      expect(await rawJob(job.id)).toEqual(current)
    }
    expect(await jobs.acknowledgeDissectionDispatch(job.id, second.attemptId, second.dispatch!.leaseToken!, true)).toBeTruthy()
    await jobs.cancelDissection(job.id, owner)
    const retry = (await jobs.prepareDissectionRetry(job.id, owner, second.attemptId))!
    const replacement = await rawJob(job.id)
    expect(await jobs.acknowledgeDissectionDispatch(job.id, second.attemptId, second.dispatch!.leaseToken!, false)).toBeNull()
    expect(await rawJob(job.id)).toEqual(replacement)
    expect(retry.manifest!.execution!.attemptId).not.toBe(second.attemptId)
  })

  it('keeps cancellation and imported receipts immutable across recovery and stale lease acknowledgements', async () => {
    const cancelled = await queued()
    const lease = (await jobs.reserveDissectionDispatch(cancelled.id, cancelled.manifest.execution.attemptId))!.manifest!.execution!
    await jobs.cancelDissection(cancelled.id, owner)
    const imported = await complete()
    const body = { expectedResultId: imported.expectedResultId, formatKey: 'mrec' }
    const receipt = await importJob(importEvent(imported.id, body))
    const before = await Promise.all([rawJob(cancelled.id), rawJob(imported.id)])
    const send = vi.fn()
    await Promise.all(Array.from({ length: 12 }, () => recoverDissectionDispatches(queueEvent(send))))
    expect(await jobs.acknowledgeDissectionDispatch(cancelled.id, lease.attemptId, lease.dispatch!.leaseToken!, true)).toBeNull()
    expect(await Promise.all([rawJob(cancelled.id), rawJob(imported.id)])).toEqual(before)
    expect(await importJob(importEvent(imported.id, body))).toEqual(receipt)
    expect(send).not.toHaveBeenCalled()
    expect(boundary.analyze).not.toHaveBeenCalled()
  })

  it('expires overdue recoverable jobs without claiming providers and never repairs unknown legacy rows', async () => {
    const pending = await queued()
    const running = await queued()
    const legacy = await queued()
    const claim = (await jobs.claimDissectionAttempt(running.id, { attemptId: running.manifest.execution.attemptId }))!
    await sql(`UPDATE banner_dissections SET manifest = manifest #- '{execution,dispatch}' WHERE job_id = $1`, [legacy.id])
    await sql(`UPDATE banner_dissections SET manifest = jsonb_set(manifest, '{execution,deadlineAt}',
      to_jsonb((clock_timestamp() - interval '1 second')::text))`)
    const legacyBefore = await rawJob(legacy.id)
    const send = vi.fn()
    await recoverDissectionDispatches(queueEvent(send))
    expect((await rawJob(pending.id)).status).toBe('failed')
    expect((await rawJob(running.id)).status).toBe('failed')
    expect(await rawJob(legacy.id)).toEqual(legacyBefore)
    expect(await jobs.writeDissectionAttempt(running.id, claim.manifest!.execution!, 'complete', { layers: [] })).toBeNull()
    expect(send).not.toHaveBeenCalled()
    expect(boundary.analyze).not.toHaveBeenCalled()
  })

  it('bounds transport reservations independently from three explicit provider generations', async () => {
    const job = await queued()
    const send = vi.fn(async () => {
      throw new Error('Synthetic send uncertainty')
    })
    const event = queueEvent(send)
    await dispatchDissection(event, job.id, job.manifest.execution.attemptId)
    for (let index = 1; index < 5; index++) {
      await makeDispatchDue(job.id)
      await recoverDissectionDispatches(event)
    }
    expect(send).toHaveBeenCalledTimes(5)
    const exhausted = await rawJob(job.id)
    expect(exhausted.manifest.execution).toMatchObject({ attempt: 1, maxAttempts: 3,
      dispatch: { sendCount: 5 } })
    await makeDispatchDue(job.id)
    await Promise.all(Array.from({ length: 12 }, () => recoverDissectionDispatches(event)))
    expect(send).toHaveBeenCalledTimes(5)
    expect((await rawJob(job.id)).manifest.execution.attempt).toBe(1)
    await jobs.cancelDissection(job.id, owner)
    const second = (await jobs.prepareDissectionRetry(job.id, owner, job.manifest.execution.attemptId))!
    expect(second.manifest!.execution).toMatchObject({ attempt: 2, dispatch: { sendCount: 0 } })
    await dispatchDissection(event, job.id, second.manifest!.execution!.attemptId)
    expect(send).toHaveBeenCalledTimes(6)
    await jobs.cancelDissection(job.id, owner)
    const third = (await jobs.prepareDissectionRetry(job.id, owner, second.manifest!.execution!.attemptId))!
    expect(third.manifest!.execution!.attempt).toBe(3)
    await jobs.cancelDissection(job.id, owner)
    expect(await jobs.prepareDissectionRetry(job.id, owner, third.manifest!.execution!.attemptId)).toBeNull()
    expect(boundary.analyze).not.toHaveBeenCalled()
  })

  it('does not resume unknown running provider work after lease expiry or start inference without a queue', async () => {
    const job = await queued()
    await jobs.reserveDissectionDispatch(job.id, job.manifest.execution.attemptId)
    await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId })
    await makeDispatchDue(job.id)
    const before = await rawJob(job.id)
    const send = vi.fn()
    await recoverDissectionDispatches(queueEvent(send))
    expect(await rawJob(job.id)).toEqual(before)
    const pending = await queued()
    const pendingBefore = await rawJob(pending.id)
    const waitUntil = vi.fn()
    await recoverDissectionDispatches({ context: {}, waitUntil } as never)
    expect(await rawJob(pending.id)).toEqual(pendingBefore)
    expect(waitUntil).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(boundary.analyze).not.toHaveBeenCalled()
    expect(boundary.segment).not.toHaveBeenCalled()
    expect(boundary.upload).not.toHaveBeenCalled()
  })

  it.each([
    { mode: 'production', host: 'localhost' },
    { mode: 'development', host: 'dashboard.example.invalid' }
  ])('never starts the local lifetime fallback on $mode/$host', async ({ mode, host }) => {
    vi.stubEnv('NODE_ENV', mode)
    try {
      const job = await queued()
      const waitUntil = vi.fn()
      await dispatchDissection({ context: {}, path: '/', node: { req: { headers: { host }, url: '/' } }, waitUntil } as never,
        job.id, job.manifest.execution.attemptId)
      expect(waitUntil).not.toHaveBeenCalled()
      expect((await rawJob(job.id)).status).toBe('failed')
      expect(boundary.analyze).not.toHaveBeenCalled()
      expect(boundary.segment).not.toHaveBeenCalled()
      expect(boundary.upload).not.toHaveBeenCalled()
    } finally { vi.stubEnv('NODE_ENV', 'test') }
  })

  it('cancels before claim, making every duplicate queue delivery a provider-free no-op', async () => {
    const job = await queued()
    await jobs.reserveDissectionDispatch(job.id, job.manifest.execution.attemptId)
    await jobs.cancelDissection(job.id, owner)
    const deliveries = await Promise.all(Array.from({ length: 12 }, () => runDissectionPipeline(null, job.id, { attemptId: job.manifest.execution.attemptId })))
    expect(deliveries.every(result => result.status === 'cancelled')).toBe(true)
    expect(boundary.analyze).not.toHaveBeenCalled()
    expect(boundary.segment).not.toHaveBeenCalled()
    expect(boundary.upload).not.toHaveBeenCalled()
  })

  it('fences dispatch failure by queued state and generation while preserving cancellation and later retries', async () => {
    const job = await queued()
    await jobs.reserveDissectionDispatch(job.id, job.manifest.execution.attemptId)
    expect(await jobs.failDissectionDispatch(job.id, randomUUID(), 'Synthetic failure')).toBeNull()
    const failed = (await jobs.failDissectionDispatch(job.id, job.manifest.execution.attemptId, 'Synthetic failure'))!
    expect(failed).toMatchObject({ status: 'failed', error: 'Synthetic failure' })
    expect(await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId })).toBeNull()
    const retry = (await jobs.prepareDissectionRetry(job.id, owner, job.manifest.execution.attemptId))!
    expect(await jobs.failDissectionDispatch(job.id, job.manifest.execution.attemptId, 'Late failure')).toBeNull()
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('queued')
    await jobs.cancelDissection(job.id, owner)
    expect(await jobs.failDissectionDispatch(job.id, retry.manifest!.execution!.attemptId, 'Late failure')).toBeNull()
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('cancelled')
  })

  it('serializes racing queue claim and dispatch failure without allowing both transitions', async () => {
    for (let index = 0; index < 12; index++) {
      const job = await queued()
      const [claim, failure] = await Promise.all([
        jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId }),
        jobs.failDissectionDispatch(job.id, job.manifest.execution.attemptId, 'Synthetic uncertain dispatch')
      ])
      expect([claim, failure].filter(Boolean)).toHaveLength(1)
      const current = await jobs.loadDissection(job.id, owner)
      expect(current.status).toBe(claim ? 'analyzing' : 'failed')
      if (claim) {
        expect(await jobs.failDissectionDispatch(job.id, job.manifest.execution.attemptId, 'Late failure')).toBeNull()
        await jobs.writeDissectionAttempt(job.id, claim.manifest!.execution!, 'complete', { layers: [] })
        expect(await jobs.failDissectionDispatch(job.id, job.manifest.execution.attemptId, 'Even later failure')).toBeNull()
        expect((await jobs.loadDissection(job.id, owner)).status).toBe('complete')
      }
    }
  })

  it('retains an immutable imported receipt against late dispatch, retry and queue delivery', async () => {
    const job = await complete()
    const body = { expectedResultId: job.expectedResultId, formatKey: 'mrec' }
    const receipt = await importJob(importEvent(job.id, body))
    const before = await jobs.loadDissection(job.id, owner)
    await Promise.all([
      jobs.failDissectionDispatch(job.id, job.manifest.execution.attemptId, 'Late dispatch failure'),
      jobs.prepareDissectionRetry(job.id, owner, job.manifest.execution.attemptId),
      jobs.reserveDissectionDispatch(job.id, job.manifest.execution.attemptId),
      runDissectionPipeline(null, job.id, { attemptId: job.manifest.execution.attemptId })
    ])
    const after = await jobs.loadDissection(job.id, owner)
    expect(after).toEqual(before)
    expect(await importJob(importEvent(job.id, body))).toEqual(receipt)
    expect(boundary.analyze).not.toHaveBeenCalled()
    expect((await sql('SELECT count(*)::int AS count FROM banner_projects')).rows[0].count).toBe(1)
  })

  it('keeps provider-produced control fields out of persisted execution and receipts', async () => {
    const job = await queued()
    const claimed = (await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId }))!
    const written = await jobs.writeDissectionAttempt(job.id, claimed.manifest!.execution!, 'review_ready', {
      layers: [], tokens: {}, execution: { attempt: 0, maxAttempts: 999, attemptId: 'spoof' },
      importReceipt: { projectId: 'spoof' }, jobId: 'spoof', status: 'imported'
    } as never)
    expect(written!.manifest!.execution!.attempt).toBe(1)
    expect(written!.manifest!.execution!.attemptId).toBe(claimed.manifest!.execution!.attemptId)
    expect(written!.manifest!.execution!.maxAttempts).toBe(3)
    expect(written!.manifest).not.toHaveProperty('importReceipt')
    expect(written!.manifest).toMatchObject({ jobId: job.id, status: 'review_ready' })
  })

  it('fences a real pipeline awaiting provider analysis when cancellation commits first', async () => {
    const job = await queued()
    let finish!: (value: unknown) => void
    let started!: () => void
    const reachedProvider = new Promise<void>((resolve) => {
      started = resolve
    })
    boundary.analyze.mockImplementation(() => {
      started()
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const pending = runDissectionPipeline(null, job.id, { attemptId: job.manifest.execution.attemptId })
    await reachedProvider
    const duplicateDeliveries = await Promise.all(Array.from({ length: 8 }, () => runDissectionPipeline(null, job.id, { attemptId: job.manifest.execution.attemptId })))
    expect(duplicateDeliveries.every(result => result.status === 'analyzing')).toBe(true)
    expect(boundary.analyze).toHaveBeenCalledTimes(1)
    await makeDispatchDue(job.id)
    const send = vi.fn()
    await Promise.all(Array.from({ length: 8 }, () => recoverDissectionDispatches(queueEvent(send))))
    expect(send).not.toHaveBeenCalled()
    expect(boundary.analyze).toHaveBeenCalledTimes(1)
    await jobs.cancelDissection(job.id, owner)
    finish({ tokens: {}, layers: [], warnings: [] })
    expect(await pending).toMatchObject({ status: 'cancelled' })
    expect(boundary.analyze).toHaveBeenCalledTimes(1)
    expect(boundary.segment).not.toHaveBeenCalled()
    expect(boundary.upload).not.toHaveBeenCalled()
    expect((await jobs.loadDissection(job.id, owner)).status).toBe('cancelled')
  })

  it('serializes simultaneous new-project imports into one project and one stable receipt', async () => {
    const job = await complete()
    const body = { expectedResultId: job.expectedResultId, formatKey: 'mrec' }
    const results = await Promise.all(Array.from({ length: 12 }, () => importJob(importEvent(job.id, body))))
    expect(new Set(results.map(result => result.projectId)).size).toBe(1)
    expect(new Set(results.map(result => result.receiptId)).size).toBe(1)
    expect((await sql('SELECT count(*)::int AS count FROM banner_projects')).rows[0].count).toBe(1)
    const record = await jobs.loadDissection(job.id, owner)
    expect(record.status).toBe('imported')
    expect(record.project_id).toBe(results[0]!.projectId)
    expect(record.manifest!.importReceipt).toMatchObject({ response: results[0] })
    expect(await importJob(importEvent(job.id, body))).toEqual(results[0])
    await expect(importJob(importEvent(job.id, { ...body, formatKey: Object.keys(FORMATS).find(key => key !== 'mrec') }))).rejects.toMatchObject({ statusCode: 409 })
    await expect(jobs.cancelDissection(job.id, owner)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('updates an existing project once and replays its receipt without undoing later edits', async () => {
    const job = await complete()
    const { rows: [project] } = await sql('INSERT INTO banner_projects (created_by) VALUES ($1) RETURNING id, updated_at', [owner])
    const body = { projectId: project.id, expectedRevision: project.updated_at.toISOString(), expectedResultId: job.expectedResultId }
    const results = await Promise.all(Array.from({ length: 8 }, () => importJob(importEvent(job.id, body))))
    expect(new Set(results.map(result => result.receiptId)).size).toBe(1)
    await sql(`UPDATE banner_projects SET canvas_data = '{"later":"edit"}', updated_at = updated_at + interval '1 second' WHERE id = $1`, [project.id])
    expect(await importJob(importEvent(job.id, body))).toEqual(results[0])
    expect((await sql('SELECT canvas_data FROM banner_projects WHERE id = $1', [project.id])).rows[0].canvas_data).toEqual({ later: 'edit' })
  })

  it('rolls back stale target revision without project mutation or receipt', async () => {
    const job = await complete()
    const { rows: [project] } = await sql(`INSERT INTO banner_projects (created_by, canvas_data) VALUES ($1, '{"preserve":true}') RETURNING id, updated_at`, [owner])
    await sql(`UPDATE banner_projects SET updated_at = updated_at + interval '1 second' WHERE id = $1`, [project.id])
    await expect(importJob(importEvent(job.id, { projectId: project.id, expectedRevision: project.updated_at.toISOString(), expectedResultId: job.expectedResultId }))).rejects.toMatchObject({ statusCode: 409 })
    expect((await sql('SELECT canvas_data FROM banner_projects WHERE id = $1', [project.id])).rows[0].canvas_data).toEqual({ preserve: true })
    const record = await jobs.loadDissection(job.id, owner)
    expect(record.status).toBe('complete')
    expect(record.project_id).toBeNull()
    expect(record.manifest).not.toHaveProperty('importReceipt')
  })

  it('rolls back project insertion when PostgreSQL rejects the receipt write', async () => {
    const job = await complete()
    await sql(`CREATE FUNCTION reject_proof_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.status = 'imported' THEN RAISE EXCEPTION 'synthetic receipt write failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_proof_receipt BEFORE UPDATE ON banner_dissections FOR EACH ROW EXECUTE FUNCTION reject_proof_receipt()`)
    try {
      await expect(importJob(importEvent(job.id, { expectedResultId: job.expectedResultId }))).rejects.toThrow('synthetic receipt write failure')
      expect((await sql('SELECT count(*)::int AS count FROM banner_projects')).rows[0].count).toBe(0)
      expect((await jobs.loadDissection(job.id, owner)).status).toBe('complete')
    } finally {
      await sql('DROP TRIGGER reject_proof_receipt ON banner_dissections; DROP FUNCTION reject_proof_receipt()')
    }
  })

  it('rejects cancelled jobs, stale accepted results, other owners and unauthorized targets', async () => {
    const job = await complete()
    await expect(importJob(importEvent(job.id, { expectedResultId: '0'.repeat(64) }))).rejects.toMatchObject({ statusCode: 409 })
    await expect(importJob(importEvent(job.id, { expectedResultId: job.expectedResultId }, outsider))).rejects.toMatchObject({ statusCode: 404 })
    const { rows: [project] } = await sql('INSERT INTO banner_projects (created_by, client_id) VALUES ($1, $2) RETURNING id, updated_at', [outsider, randomUUID()])
    await expect(importJob(importEvent(job.id, { projectId: project.id, expectedRevision: project.updated_at.toISOString(), expectedResultId: job.expectedResultId }))).rejects.toMatchObject({ statusCode: 403 })
    await jobs.cancelDissection(job.id, owner)
    await expect(importJob(importEvent(job.id, { expectedResultId: job.expectedResultId }))).rejects.toMatchObject({ statusCode: 409 })
    expect((await sql('SELECT count(*)::int AS count FROM banner_projects')).rows[0].count).toBe(1)
  })

  it('expires abandoned running work, fences late writes and only starts a new generation explicitly', async () => {
    const job = await queued()
    const claim = (await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId }))!
    await sql(`UPDATE banner_dissections SET manifest = jsonb_set(manifest, '{execution,deadlineAt}', to_jsonb((clock_timestamp() - interval '1 second')::text)) WHERE job_id = $1`, [job.id])
    // Admission rejects late writes even before any poll has persisted the expiry.
    expect(await jobs.writeDissectionAttempt(job.id, claim.manifest!.execution!, 'complete', { layers: [] })).toBeNull()
    expect(await jobs.isDissectionAttemptActive(job.id, claim.manifest!.execution!.attemptId)).toBe(false)
    await expect(jobs.loadDissection(job.id, outsider)).rejects.toMatchObject({ statusCode: 404 })
    expect((await sql('SELECT status FROM banner_dissections WHERE job_id = $1', [job.id])).rows[0].status).toBe('analyzing')
    const expired = await jobs.loadDissection(job.id, owner)
    expect(expired.status).toBe('failed')
    expect(expired.error).toContain('timed out')
    expect(expired.manifest!.execution!.attempt).toBe(1)
    expect(await jobs.claimDissectionAttempt(job.id, { attemptId: job.manifest.execution.attemptId })).toBeNull()
    expect(await jobs.claimDissectionAttempt(job.id)).toBeNull()
    const retry = (await jobs.prepareDissectionRetry(job.id, owner, job.manifest.execution.attemptId))!
    expect(retry.manifest!.execution!.attempt).toBe(2)
    expect(retry.manifest!.execution!.attemptId).not.toBe(claim.manifest!.execution!.attemptId)
    expect(Date.parse(retry.manifest!.execution!.deadlineAt!)).toBeGreaterThan(Date.now())
    expect(await jobs.writeDissectionAttempt(job.id, claim.manifest!.execution!, 'complete', { layers: [] })).toBeNull()
  })

  it('expires an undelivered queued generation and prevents delayed delivery from invoking a provider', async () => {
    const job = await queued()
    await sql(`UPDATE banner_dissections SET manifest = jsonb_set(manifest, '{execution,deadlineAt}', to_jsonb((clock_timestamp() - interval '1 second')::text)) WHERE job_id = $1`, [job.id])
    expect(await runDissectionPipeline(null, job.id, { attemptId: job.manifest.execution.attemptId })).toMatchObject({ status: 'failed' })
    expect(boundary.analyze).not.toHaveBeenCalled()
    const retry = (await jobs.prepareDissectionRetry(job.id, owner, job.manifest.execution.attemptId))!
    expect(await runDissectionPipeline(null, job.id, { attemptId: job.manifest.execution.attemptId })).toMatchObject({ status: 'queued' })
    expect(boundary.analyze).not.toHaveBeenCalled()
    expect((await jobs.loadDissection(job.id, owner)).manifest!.execution!.attemptId).toBe(retry.manifest!.execution!.attemptId)
  })

  it('rejects an old reviewed generation even when retry produces identical artwork', async () => {
    const job = await complete()
    const original = await jobs.loadDissection(job.id, owner)
    await jobs.cancelDissection(job.id, owner)
    const retry = (await jobs.prepareDissectionRetry(job.id, owner, job.manifest.execution.attemptId))!
    const claimed = (await jobs.claimDissectionAttempt(job.id, { attemptId: retry.manifest!.execution!.attemptId }))!
    const completed = (await jobs.writeDissectionAttempt(job.id, claimed.manifest!.execution!, 'complete', jobs.dissectionArtwork(original.manifest!)))!
    expect(completed.manifest!.execution!.resultId).not.toBe(job.expectedResultId)
    await expect(importJob(importEvent(job.id, { expectedResultId: job.expectedResultId }))).rejects.toMatchObject({ statusCode: 409 })
    expect((await sql('SELECT count(*)::int AS count FROM banner_projects')).rows[0].count).toBe(0)
    const imported = await importJob(importEvent(job.id, { expectedResultId: completed.manifest!.execution!.resultId }))
    expect(imported.projectId).toBeTruthy()
  })
})
