import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { createApp, createRouter, getHeader, toNodeListener, type H3Event } from 'h3'
import { PNG } from 'pngjs'
import { createEngineJobAuthority } from '../../../server/utils/banner/engineJobs'
import { createEngineJobStorage, type EngineJobBucket } from '../../../server/utils/banner/engineJobStorage'
import { createLinuxEngineAdapter } from '../../../workers/banner-engine/runtime/index'
import { runEngineWorkerOnce } from '../../../workers/banner-engine/transport/index'
import type { User } from '../../../server/utils/auth'
import { engineJobClaimSchema } from '../../../shared/bannerEngineJobs'
import type { BannerEngineCapability, BannerEngineRequest } from '../../../shared/bannerEngine'

vi.mock('~~/server/utils/db', () => ({
  transactionWithoutRetry: (callback: (db: pg.PoolClient) => Promise<unknown>) => transaction(callback)
}))
// Explicit fixture sessions only. Actual route bodies/config/service auth and
// authority SQL run unchanged; this is not a hosted login or rate-store proof.
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: async (event: H3Event) => getHeader(event, 'x-proof-actor') === 'outsider' ? outsider : owner,
  requireWriteAccess: async (event: H3Event) => getHeader(event, 'x-proof-actor') === 'outsider' ? outsider : owner
}))
vi.mock('~~/server/utils/rateLimit', () => ({ enforceRateLimit: async () => undefined }))
const internalEndpoint = (await import('../../../server/api/internal/banner-engine.post')).default
const submitEndpoint = (await import('../../../server/api/agency/banner-studio/engine-jobs/index.post')).default
const statusEndpoint = (await import('../../../server/api/agency/banner-studio/engine-jobs/[jobId].get')).default
const outputEndpoint = (await import('../../../server/api/agency/banner-studio/engine-jobs/[jobId]/output.get')).default
const cancelEndpoint = (await import('../../../server/api/agency/banner-studio/engine-jobs/[jobId]/cancel.post')).default

// This suite never reads DATABASE_URL. Only the owned-cluster runner opts in.
const enabled = !!process.env.BANNER_ENGINE_JOBS_PROOF_URL
const owner: User = { id: '11111111-1111-4111-8111-111111111111', role: 'creative', email: 'proof@example.invalid', name: 'Proof', is_active: true }
const outsider: User = { ...owner, id: '22222222-2222-4222-8222-222222222222' }
const clientId = '33333333-3333-4333-8333-333333333333'
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const capability: BannerEngineCapability = {
  engine: { id: 'photocraft', version: '0.16.0' }, operation: 'render-preview',
  inputMimeType: 'application/x-photocraft', executableSha256: 'a'.repeat(64), capabilityProofSha256: 'b'.repeat(64)
}
let pool: pg.Pool
let authority: ReturnType<typeof createEngineJobAuthority>
let proofOutput = ''
let httpServer: Server | undefined
let loseCommitMatching: string | undefined
const objects = new Map<string, Buffer>()
const privateBucket: EngineJobBucket = {
  async put(key, value, options) {
    if (options.onlyIf.etagDoesNotMatch !== '*') throw new Error('Fixture requires immutable create')
    if (objects.has(key)) return null
    objects.set(key, Buffer.from(value))
    return { key }
  },
  async get(key) {
    const bytes = objects.get(key)
    return bytes
      ? { size: bytes.length, body: new ReadableStream({ start(controller) {
          controller.enqueue(bytes)
          controller.close()
        } }) }
      : null
  }
}
const storage = createEngineJobStorage(privateBucket)
async function transaction<T>(callback: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect()
  let loseCommit = false
  try {
    await db.query('BEGIN')
    const proxy = { query: async (query: string, params?: unknown[]) => {
      if (loseCommitMatching && query.includes(loseCommitMatching)) {
        loseCommit = true
        loseCommitMatching = undefined
      }
      return db.query(query, params)
    } } as pg.PoolClient
    const result = await callback(proxy)
    await db.query('COMMIT')
    if (loseCommit) throw new Error('Synthetic acknowledgement lost after commit')
    return result
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally { db.release() }
}
const sql = (query: string, params?: unknown[]) => pool.query(query, params)
async function project(client: string | null = null) {
  const id = randomUUID()
  const row = (await sql(`INSERT INTO banner_projects(id,name,created_by,client_id,canvas_data)
    VALUES ($1,'Synthetic engine proof',$2,$3,'{"300x250":{"layers":[]}}') RETURNING updated_at`, [id, owner.id, client])).rows[0]
  return { projectId: id, sourceRevision: new Date(row.updated_at).toISOString() }
}
async function submission() {
  return {
    requestId: randomUUID(), ...await project(), engine: capability.engine,
    input: { mimeType: capability.inputMimeType, base64: Buffer.from('synthetic native input').toString('base64') },
    output: { width: 2, height: 2 }
  }
}
async function claimed() {
  const body = await submission()
  const created = await authority.submit(owner, body)
  const claim = engineJobClaimSchema.parse(await authority.service({ action: 'claim', engine: capability.engine }))
  if (!claim.request) throw new Error('Expected an execution claim')
  expect(claim.request).toBeTruthy()
  return { body, created, ...claim, binding: { jobId: claim.request.jobId, attemptId: claim.request.attemptId, claimToken: claim.claimToken } }
}
function success(request: BannerEngineRequest) {
  const image = new PNG({ width: request.output.width, height: request.output.height })
  image.data.fill(128)
  const bytes = PNG.sync.write(image)
  const { limits: _limits, deadlineAt: _deadline, ...identity } = request
  const digest = hash(`banner-engine-preview:${request.attemptId.toLowerCase()}`)
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
  return { bytes, result: { ...identity, status: 'succeeded', output: { ...request.output, id, sha256: hash(bytes), bytes: bytes.length },
    evidence: { kind: 'runtime-preview', editableImport: false, executableSha256: capability.executableSha256, capabilityProofSha256: capability.capabilityProofSha256 } } }
}

describe.skipIf(!enabled)('actual engine job PostgreSQL and local HTTP proof', () => {
  beforeAll(async () => {
    const url = new URL(process.env.BANNER_ENGINE_JOBS_PROOF_URL!)
    const markerPath = process.env.BANNER_ENGINE_JOBS_PROOF_OWNER
    if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || Number(url.port) < 1024
      || url.username !== 'proof_owner' || url.password || url.search || !markerPath)
      throw new Error('Refusing non-owned proof database')
    const owned = await realpath(dirname(markerPath))
    const temporary = await realpath('/tmp')
    const marker = JSON.parse(await readFile(markerPath, 'utf8'))
    if (dirname(owned) !== temporary || !owned.startsWith(join(temporary, 'banner-engine-jobs-proof-'))
      || marker.token !== process.env.BANNER_ENGINE_JOBS_PROOF_TOKEN || marker.port !== Number(url.port)
      || url.pathname !== `/${marker.database}` || !/^banner_engine_jobs_proof_[a-f0-9]{32}$/.test(marker.database)
      || marker.data !== join(owned, 'data')) throw new Error('Proof ownership mismatch')
    pool = new pg.Pool({ connectionString: url.toString(), max: 12, connectionTimeoutMillis: 3000 })
    const identity = (await sql('SELECT current_database() AS database, current_setting(\'data_directory\') AS directory')).rows[0]
    if (identity.database !== marker.database || await realpath(identity.directory) !== await realpath(marker.data))
      throw new Error('Wrong proof cluster')
    proofOutput = process.env.BANNER_ENGINE_JOBS_PROOF_OUTPUT!
    await sql(`CREATE TABLE team_members (id uuid PRIMARY KEY);
      CREATE TABLE agency_clients (id uuid PRIMARY KEY);
      CREATE TABLE client_team_assignments (client_id uuid, team_member_id uuid);
      CREATE TABLE banner_projects (id uuid PRIMARY KEY, name text, created_by uuid REFERENCES team_members(id),
        client_id uuid REFERENCES agency_clients(id), canvas_data jsonb, updated_at timestamptz DEFAULT date_trunc('milliseconds',clock_timestamp()))`)
    await sql(await readFile(new URL('../../../server/database/migrations/483_banner_engine_jobs.sql', import.meta.url), 'utf8'))
  })
  afterAll(async () => {
    if (httpServer) await new Promise<void>((accept, reject) => httpServer!.close(error => error ? reject(error) : accept()))
    await pool?.end()
  })
  beforeEach(async () => {
    loseCommitMatching = undefined
    objects.clear()
    await sql('TRUNCATE banner_engine_jobs, banner_projects, client_team_assignments, agency_clients, team_members CASCADE')
    await sql('INSERT INTO team_members(id) VALUES ($1),($2)', [owner.id, outsider.id])
    await sql('INSERT INTO agency_clients(id) VALUES ($1)', [clientId])
    authority = createEngineJobAuthority({ transaction, storage, capabilities: [capability] })
  })
  it('admits one payload-bound idempotent job under concurrent submissions', async () => {
    const body = await submission()
    const [first, ...others] = await Promise.all(Array.from({ length: 5 }, () => authority.submit(owner, body)))
    for (const other of others) expect(other).toEqual(first)
    expect(await authority.submit(owner, body)).toEqual(first)
    const duplicate = { ...body, input: { ...body.input, base64: Buffer.from('different').toString('base64') } }
    await expect(authority.submit(owner, duplicate)).rejects.toMatchObject({ statusCode: 409 })
    expect((await sql('SELECT count(*)::int AS count FROM banner_engine_jobs')).rows[0].count).toBe(1)
  })
  it('rejects wrong owner, unassigned client and stale source before execution', async () => {
    const body = await submission()
    await expect(authority.submit(outsider, body)).rejects.toMatchObject({ statusCode: 403 })
    await expect(authority.submit(owner, { ...body, ...await project(clientId) })).rejects.toMatchObject({ statusCode: 403 })
    await expect(authority.submit(owner, { ...body, sourceRevision: '2000-01-01T00:00:00.000Z' })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('claims an attempt once across concurrent workers', async () => {
    await authority.submit(owner, await submission())
    const results = (await Promise.all(Array.from({ length: 8 }, () => authority.service({ action: 'claim', engine: capability.engine })))).map(value => engineJobClaimSchema.parse(value))
    expect(results.filter(result => result.request)).toHaveLength(1)
    const winner = results.find(result => result.request)!
    if (!winner.request) throw new Error('Expected a single winner')
    await expect(authority.service({ action: 'input', jobId: winner.request.jobId, attemptId: winner.request.attemptId, claimToken: '0'.repeat(64) })).rejects.toBeTruthy()
    expect(JSON.stringify((await sql('SELECT * FROM banner_engine_jobs')).rows)).not.toContain(winner.claimToken)
  })
  it('accepts verified PNG privately and rejects unrelated output access', async () => {
    const job = await claimed()
    const output = success(job.request)
    expect(await authority.service({ action: 'complete', ...job.binding, result: output.result, outputBase64: output.bytes.toString('base64') })).toEqual({ status: 'succeeded' })
    expect(await authority.output(owner, job.request.jobId)).toEqual(output.bytes)
    await expect(authority.output(outsider, job.request.jobId)).rejects.toMatchObject({ statusCode: 403 })
    await sql('UPDATE banner_projects SET canvas_data=$2 WHERE id=$1', [job.body.projectId, { changed: true }])
    await expect(authority.output(owner, job.request.jobId)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('fences cancellation before upload and accepts confirmed termination', async () => {
    const job = await claimed()
    const output = success(job.request)
    await authority.cancel(owner, job.request.jobId, { attemptId: job.request.attemptId })
    await expect(authority.service({ action: 'complete', ...job.binding, result: output.result, outputBase64: output.bytes.toString('base64') })).rejects.toBeTruthy()
    expect(await authority.service({ action: 'fail', ...job.binding, code: 'cancelled', termination: 'adapter-settled' })).toEqual({ status: 'cancelled' })
  })
  it('rejects modified bytes, proof pins and current source before success', async () => {
    const job = await claimed()
    const output = success(job.request)
    await expect(authority.service({ action: 'complete', ...job.binding, result: output.result, outputBase64: Buffer.from('not a PNG').toString('base64') })).rejects.toBeTruthy()
    await expect(authority.service({ action: 'complete', ...job.binding,
      result: { ...output.result, evidence: { ...output.result.evidence, capabilityProofSha256: '0'.repeat(64) } }, outputBase64: output.bytes.toString('base64') })).rejects.toBeTruthy()
    await sql('UPDATE banner_projects SET canvas_data=$2 WHERE id=$1', [job.body.projectId, { changed: true }])
    await expect(authority.service({ action: 'complete', ...job.binding, result: output.result, outputBase64: output.bytes.toString('base64') })).rejects.toBeTruthy()
  })
  it('fences cancellation and source mutation racing asynchronous output storage', async () => {
    for (const mutation of ['cancel', 'source']) {
      const job = await claimed()
      const output = success(job.request)
      authority = createEngineJobAuthority({ transaction, capabilities: [capability], storage: {
        ...storage, async put(key, bytes, mime) {
          await storage.put(key, bytes, mime)
          if (mime !== 'image/png') return
          if (mutation === 'cancel') await authority.cancel(owner, job.request.jobId, { attemptId: job.request.attemptId })
          else await sql('UPDATE banner_projects SET canvas_data=$2 WHERE id=$1', [job.body.projectId, { racingChange: true }])
        }
      } })
      await expect(authority.service({ action: 'complete', ...job.binding, result: output.result, outputBase64: output.bytes.toString('base64') })).rejects.toMatchObject({ statusCode: 409 })
      expect((await sql('SELECT status,result FROM banner_engine_jobs WHERE job_id=$1', [job.request.jobId])).rows[0]).toEqual({ status: 'cancelling', result: null })
      await expect(authority.output(owner, job.request.jobId)).rejects.toBeTruthy()
      authority = createEngineJobAuthority({ transaction, storage, capabilities: [capability] })
    }
  })
  it('holds lost claim acknowledgements and retains accepted output after a lost completion acknowledgement', async () => {
    const created = await authority.submit(owner, await submission())
    loseCommitMatching = 'SET status = \'running\''
    await expect(authority.service({ action: 'claim', engine: capability.engine })).rejects.toThrow('acknowledgement lost')
    expect(await authority.service({ action: 'claim', engine: capability.engine })).toEqual({ request: null })
    expect((await authority.status(owner, created.jobId)).status).toBe('running')
    const job = await claimed()
    const output = success(job.request)
    loseCommitMatching = 'SET status = \'succeeded\''
    await expect(authority.service({ action: 'complete', ...job.binding, result: output.result, outputBase64: output.bytes.toString('base64') })).rejects.toThrow('acknowledgement lost')
    expect((await authority.status(owner, job.request.jobId)).status).toBe('succeeded')
    expect(await authority.output(owner, job.request.jobId)).toEqual(output.bytes)
    expect(await authority.service({ action: 'fail', ...job.binding, code: 'transport-failed', termination: 'unconfirmed' })).toEqual({ status: 'succeeded' })
  })
  it('expires queued work and holds running or cancelling work without requeue', async () => {
    // A deliberately skewed application clock gives these owned synthetic jobs
    // a short deadline; actual expiry still uses the PostgreSQL clock.
    authority = createEngineJobAuthority({ transaction, storage, capabilities: [capability], now: () => Date.now() - 299250 })
    const runningJob = await claimed()
    const cancellingJob = await claimed()
    await authority.cancel(owner, cancellingJob.request.jobId, { attemptId: cancellingJob.request.attemptId })
    const queuedJob = await authority.submit(owner, await submission())
    await new Promise(accept => setTimeout(accept, 900))
    expect((await authority.status(owner, runningJob.request.jobId)).status).toBe('uncertain')
    expect((await authority.status(owner, cancellingJob.request.jobId)).status).toBe('uncertain')
    expect((await authority.status(owner, queuedJob.jobId)).status).toBe('expired')
    expect(await authority.service({ action: 'claim', engine: capability.engine })).toEqual({ request: null })
    await expect(sql('UPDATE banner_engine_jobs SET status=\'queued\' WHERE job_id=$1', [runningJob.request.jobId])).rejects.toThrow('immutable')
  })
  it('holds unconfirmed native cleanup for running and cancelling attempts durably', async () => {
    for (const cancel of [false, true]) {
      const job = await claimed()
      if (cancel) await authority.cancel(owner, job.request.jobId, { attemptId: job.request.attemptId })
      expect(await authority.service({ action: 'fail', ...job.binding, code: 'engine-failed', termination: 'unconfirmed' })).toEqual({ status: 'uncertain' })
      expect((await authority.status(owner, job.request.jobId)).status).toBe('uncertain')
      expect(await authority.service({ action: 'claim', engine: capability.engine })).toEqual({ request: null })
      const output = success(job.request)
      await expect(authority.service({ action: 'complete', ...job.binding, result: output.result, outputBase64: output.bytes.toString('base64') })).rejects.toMatchObject({ statusCode: 409 })
    }
  })
  it('rechecks assignment and project ownership after private object reads', async () => {
    await sql('INSERT INTO client_team_assignments(client_id,team_member_id) VALUES ($1,$2)', [clientId, owner.id])
    const body = { ...await submission(), ...await project(clientId) }
    const created = await authority.submit(owner, body)
    const claim = engineJobClaimSchema.parse(await authority.service({ action: 'claim', engine: capability.engine }))
    if (!claim.request) throw new Error('Expected an execution claim')
    const output = success(claim.request)
    await authority.service({ action: 'complete', jobId: created.jobId, attemptId: created.attemptId, claimToken: claim.claimToken, result: output.result, outputBase64: output.bytes.toString('base64') })
    authority = createEngineJobAuthority({ transaction, capabilities: [capability], storage: { ...storage, async get(key, descriptor) {
      const bytes = await storage.get(key, descriptor)
      await sql('DELETE FROM client_team_assignments WHERE client_id=$1 AND team_member_id=$2', [clientId, owner.id])
      return bytes
    } } })
    await expect(authority.output(owner, created.jobId)).rejects.toMatchObject({ statusCode: 403 })
    await expect(authority.submit(owner, body)).rejects.toMatchObject({ statusCode: 403 })
    await sql('UPDATE banner_projects SET created_by=$2 WHERE id=$1', [body.projectId, outsider.id])
    await expect(authority.status({ ...outsider, role: 'admin' }, created.jobId)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('runs PhotoCraft and VectorCraft through authenticated HTTP and persists exact private PNGs', async () => {
    const engines = ['photocraft', 'vectorcraft'] as const
    const adapters = await Promise.all(engines.map(engine => createLinuxEngineAdapter(engine)))
    authority = createEngineJobAuthority({ transaction, storage, capabilities: adapters.map(adapter => adapter.capability) })
    const serviceToken = randomUUID() + randomUUID()
    const bindings = {
      BANNER_ENGINE_ENABLED: 'true', BANNER_ENGINE_ALLOW_LOOPBACK: 'true', BANNER_ENGINE_SERVICE_TOKEN: serviceToken,
      BANNER_ENGINE_CAPABILITIES: JSON.stringify(adapters.map(adapter => adapter.capability)), BANNER_ENGINE_BUCKET: privateBucket
    }
    const app = createApp()
    app.use((event) => {
      event.context.cloudflare = { env: bindings }
    })
    const router = createRouter()
      .post('/api/internal/banner-engine', internalEndpoint)
      .post('/api/agency/banner-studio/engine-jobs', submitEndpoint)
      .get('/api/agency/banner-studio/engine-jobs/:jobId', statusEndpoint)
      .get('/api/agency/banner-studio/engine-jobs/:jobId/output', outputEndpoint)
      .post('/api/agency/banner-studio/engine-jobs/:jobId/cancel', cancelEndpoint)
    app.use(router)
    httpServer = createServer(toNodeListener(app))
    await new Promise<void>(accept => httpServer!.listen(0, '127.0.0.1', accept))
    const address = httpServer.address()
    if (!address || typeof address === 'string') throw new Error('No owned HTTP port')
    const origin = `http://127.0.0.1:${address.port}`
    const denied = await fetch(`${origin}/api/internal/banner-engine`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'claim', engine: capability.engine }) })
    expect(denied.status).toBe(401)
    expect(denied.headers.get('cache-control')).toBe('private, no-store')
    const evidence: unknown[] = []
    for (const [index, engine] of engines.entries()) {
      const adapter = adapters[index]!
      const extension = engine === 'photocraft' ? 'pcraft' : 'vectorcraft'
      const input = await readFile(resolve(`output/editable-artwork-online-engine/linux/fixtures/${engine}.${extension}`))
      const output = engine === 'photocraft' ? { width: 256, height: 256 } : { width: 640, height: 360 }
      const body = { requestId: randomUUID(), ...await project(), engine: adapter.capability.engine,
        input: { mimeType: adapter.capability.inputMimeType, base64: input.toString('base64') }, output }
      const submitted = await fetch(`${origin}/api/agency/banner-studio/engine-jobs`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      })
      expect(submitted.status).toBe(200)
      const created = await submitted.json() as Awaited<ReturnType<typeof authority.submit>>
      const directory = join(proofOutput, engine)
      await mkdir(directory, { recursive: true })
      const worker = await runEngineWorkerOnce({ origin, serviceToken, allowLoopbackHttp: true,
        stagingRoot: join(directory, 'staging'), workspaceRoot: join(directory, 'attempts'), adapter })
      expect(worker.status, JSON.stringify(worker)).toBe('succeeded')
      const jobId = 'jobId' in worker ? worker.jobId! : created.jobId
      const previewUrl = `${origin}/api/agency/banner-studio/engine-jobs/${jobId}/output`
      const preview = await fetch(previewUrl)
      expect(preview.status).toBe(200)
      expect(preview.headers.get('cache-control')).toBe('private, no-store')
      expect(preview.headers.get('content-type')).toContain('image/png')
      const saved = Buffer.from(await preview.arrayBuffer())
      const deniedOutput = await fetch(previewUrl, { headers: { 'x-proof-actor': 'outsider' } })
      expect(deniedOutput.status).toBe(403)
      const image = PNG.sync.read(saved)
      expect({ width: image.width, height: image.height }).toEqual(output)
      let partialAlpha = 0
      let transparent = 0
      for (let offset = 3; offset < image.data.length; offset += 4) {
        if (image.data[offset] === 0) transparent++
        else if (image.data[offset]! < 255) partialAlpha++
      }
      expect(partialAlpha).toBeGreaterThan(0)
      expect(transparent).toBeGreaterThan(0)
      await writeFile(join(directory, 'private-preview.png'), saved, { flag: 'wx' })
      const statusResponse = await fetch(`${origin}/api/agency/banner-studio/engine-jobs/${jobId}`)
      expect(statusResponse.status).toBe(200)
      const status = await statusResponse.json()
      evidence.push({ engine, worker, status, inputSha256: hash(input), outputSha256: hash(saved), dimensions: output, partialAlpha, transparent })
      expect(await runEngineWorkerOnce({ origin, serviceToken, allowLoopbackHttp: true,
        stagingRoot: join(directory, 'staging'), workspaceRoot: join(directory, 'attempts'), adapter })).toEqual({ status: 'idle' })
      const cancelSubmission = await fetch(`${origin}/api/agency/banner-studio/engine-jobs`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, requestId: randomUUID() })
      })
      expect(cancelSubmission.status).toBe(200)
      const queued = await cancelSubmission.json() as Awaited<ReturnType<typeof authority.submit>>
      const cancelled = await fetch(`${origin}/api/agency/banner-studio/engine-jobs/${queued.jobId}/cancel`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attemptId: queued.attemptId })
      })
      expect(cancelled.status).toBe(200)
      expect((await cancelled.json() as { status: string }).status).toBe('cancelled')
      expect(await runEngineWorkerOnce({ origin, serviceToken, allowLoopbackHttp: true,
        stagingRoot: join(directory, 'staging'), workspaceRoot: join(directory, 'attempts'), adapter })).toEqual({ status: 'idle' })
    }
    await writeFile(join(proofOutput, 'native-http-evidence.json'), JSON.stringify({
      scope: 'Actual PostgreSQL job authority, authenticated loopback HTTP and Linux render; synthetic user/private bucket fixtures. No hosted deployment.',
      engines: evidence, productionHttpEndpoints: true, fixtureAuthAndRateStore: true, privateStorageFixture: true
    }, null, 2))
    await new Promise<void>((accept, reject) => httpServer!.close(error => error ? reject(error) : accept()))
    httpServer = undefined
  }, 180000)
})
