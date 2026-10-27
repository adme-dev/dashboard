import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngineJobAuthority, engineJobSource, engineJobOutputId } from '../../../server/utils/banner/engineJobs'
import type { User } from '../../../server/utils/auth'

const id = '23c1889b-f7bc-4da5-a01a-1572eb3f2638', other = '33c1889b-f7bc-4da5-a01a-1572eb3f2638'
const now = Date.parse('2026-10-27T05:00:00.000Z')
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex')
const actor = { id, role: 'admin', permissionGroups: ['ADMIN', 'CREATIVE'] } as User
const project = () => ({ id, client_id: null, created_by: id, updated_at: new Date(now), canvas_data: { z: 1, a: { layers: [] } } })
const cap = { engine: { id: 'photocraft' as const, version: '0.16.0' }, operation: 'render-preview' as const, inputMimeType: 'application/x-photocraft', executableSha256: 'b'.repeat(64), capabilityProofSha256: 'c'.repeat(64) }
const inputBytes = Buffer.from('native-file')
const submit = () => ({ requestId: id, projectId: id, sourceRevision: new Date(now).toISOString(), engine: cap.engine, input: { mimeType: cap.inputMimeType, base64: inputBytes.toString('base64') }, output: { width: 2, height: 2 } })
function job() {
  const request = { version: 1, jobId: id, attemptId: other, ...engineJobSource(project()), engine: cap.engine, operation: 'render-preview', input: { id, bytes: inputBytes.length, sha256: sha(inputBytes), mimeType: cap.inputMimeType }, output: { mimeType: 'image/png', width: 2, height: 2 }, limits: { maxInputBytes: 16777216, maxOutputBytes: 16777216, maxPixels: 4194304, timeoutMs: 120000, memoryMb: 2048, cpuCount: 2, maxProcesses: 32, maxLogBytes: 65536 }, deadlineAt: new Date(now + 300000).toISOString() }
  return { job_id: id, attempt_id: other, owner_id: id, project_id: id, client_id: null, project_owner_id: id, request_id: id, payload_sha256: '', request, input_asset: { ...request.input, projectId: id, clientId: null }, capability: cap, input_key: `engine-jobs/${id}/input/${id}`, output_key: `engine-jobs/${id}/${other}/preview.png`, output_asset_id: engineJobOutputId(other), status: 'running', claim_token_sha256: sha('a'.repeat(64)), result: null, failure_code: null, termination: null, created_at: new Date(now), updated_at: new Date(now), deadline_at: new Date(now + 300000), execution_deadline_at: new Date(now + 120000) }
}
function fixture() {
  let current = project(), row = job()
  const queries: string[] = []
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    queries.push(sql)
    if (sql.includes('FROM banner_projects'))
      return { rows: current ? [structuredClone(current)] : [] }
    if (sql.includes('FROM client_team_assignments'))
      return { rows: [] }
    if (sql.includes('UPDATE banner_engine_jobs') && sql.includes('SET status = $2')) {
      row.status = params![1] as string
      row.failure_code = params![2] as never
      row.termination = params![3] as never
      return { rows: [structuredClone(row)] }
    }
    if (sql.includes('UPDATE banner_engine_jobs') && sql.includes('status = \'succeeded\'')) {
      row.status = 'succeeded'
      row.result = JSON.parse(params![1] as string)
      return { rows: [structuredClone(row)] }
    }
    if (sql.includes('UPDATE banner_engine_jobs') && sql.includes('status = CASE'))
      return { rows: [] }
    if (sql.includes('FROM banner_engine_jobs'))
      return { rows: row ? [structuredClone(row)] : [] }
    return { rows: [] }
  })
  const storage = { get: vi.fn().mockResolvedValue(inputBytes), put: vi.fn().mockResolvedValue(undefined) }
  const tx = vi.fn(async (callback: (db: {
    query: typeof query
  }) => Promise<unknown>) => callback({ query }))
  const authority = createEngineJobAuthority({ transaction: tx as never, storage, capabilities: [cap], now: () => now })
  return { authority, storage, query, tx, queries,
    get row() { return row },
    set row(v) { row = v },
    get current() { return current },
    set current(v) { current = v }
  }
}
const service = (action: string) => ({ action, jobId: id, attemptId: other, claimToken: 'a'.repeat(64) })
function completion(row: ReturnType<typeof job>) {
  const image = new PNG({ width: 2, height: 2 })
  image.data.fill(255)
  const output = PNG.sync.write(image)
  const { limits: _limits, deadlineAt: _deadline, ...identity } = row.request
  return { ...service('complete'), result: { ...identity, status: 'succeeded', output: { ...row.request.output, id: row.output_asset_id, bytes: output.length, sha256: sha(output) }, evidence: { kind: 'runtime-preview', editableImport: false, executableSha256: cap.executableSha256, capabilityProofSha256: cap.capabilityProofSha256 } }, outputBase64: output.toString('base64') }
}
beforeEach(() => vi.clearAllMocks())
describe('engine jobs durable authority orchestration', () => {
  it('canonicalizes saved source without object-key ordering drift', () => {
    const a = engineJobSource(project())
    const b = engineJobSource({ ...project(), canvas_data: { a: { layers: [] }, z: 1 } })
    expect(a).toEqual(b)
    expect(engineJobSource({ ...project(), canvas_data: { a: { layers: [1] }, z: 1 } }).sourceHash).not.toBe(a.sourceHash)
  })
  it('denies null-client projects owned by another user before storage access', async () => {
    const f = fixture()
    f.current.created_by = other
    await expect(f.authority.submit({ ...actor, role: 'member', permissionGroups: ['CREATIVE'] }, submit())).rejects.toMatchObject({ statusCode: 403 })
    expect(f.storage.put).not.toHaveBeenCalled()
  })
  it('checks current client assignments rather than trusting historical job ownership', async () => {
    const f = fixture()
    f.current.client_id = other as never
    await expect(f.authority.status({ ...actor, role: 'member', permissionGroups: ['CREATIVE'] }, id)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.storage.get).not.toHaveBeenCalled()
  })
  it('rejects stale submit revision and conflicting owner requestId payload', async () => {
    const f = fixture()
    await expect(f.authority.submit(actor, { ...submit(), sourceRevision: '2026-10-26T00:00:00.000Z' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(f.authority.submit(actor, submit())).rejects.toMatchObject({ statusCode: 409 })
    expect(f.storage.put).not.toHaveBeenCalled()
  })
  it('rejects another claim token before touching input', async () => {
    const f = fixture()
    await expect(f.authority.service({ ...service('input'), claimToken: 'b'.repeat(64) })).rejects.toMatchObject({ statusCode: 404 })
    expect(f.storage.get).not.toHaveBeenCalled()
  })
  it('accepts private bound input only while running', async () => {
    const f = fixture()
    expect(await f.authority.service(service('input'))).toEqual({ base64: inputBytes.toString('base64') })
    f.row.status = 'cancelling'
    await expect(f.authority.service(service('input'))).rejects.toMatchObject({ statusCode: 409 })
  })
  it('cancels the queued attempt terminally and fences running late completion', async () => {
    const f = fixture()
    f.row.status = 'queued'
    expect((await f.authority.cancel(actor, id, { attemptId: other })).status).toBe('cancelled')
    f.row.status = 'running'
    expect((await f.authority.cancel(actor, id, { attemptId: other })).status).toBe('cancelling')
    await expect(f.authority.service(completion(f.row))).rejects.toMatchObject({ statusCode: 409 })
    expect(f.storage.put).not.toHaveBeenCalled()
  })
  it('holds unconfirmed termination and never promotes uncertain to success', async () => {
    const f = fixture()
    expect(await f.authority.service({ ...service('fail'), code: 'transport-failed', termination: 'unconfirmed' })).toEqual({ status: 'uncertain' })
    await expect(f.authority.service(completion(f.row))).rejects.toMatchObject({ statusCode: 409 })
    expect(f.storage.put).not.toHaveBeenCalled()
  })
  it('validates actual output bytes and pinned capability before storing success', async () => {
    const f = fixture()
    const body = completion(f.row)
    await expect(f.authority.service({ ...body, outputBase64: Buffer.from('bad PNG').toString('base64') })).rejects.toMatchObject({ statusCode: 409 })
    body.result.evidence.executableSha256 = 'd'.repeat(64)
    await expect(f.authority.service(body)).rejects.toMatchObject({ statusCode: 409 })
    expect(f.storage.put).not.toHaveBeenCalled()
  })
  it('publishes validated output and permits private retrieval only for unchanged source', async () => {
    const f = fixture()
    const body = completion(f.row)
    expect(await f.authority.service(body)).toEqual({ status: 'succeeded' })
    const bytes = Buffer.from(body.outputBase64, 'base64')
    f.storage.get.mockResolvedValue(bytes)
    expect(await f.authority.output(actor, id)).toEqual(bytes)
    f.current.canvas_data.z = 2
    await expect(f.authority.output(actor, id)).rejects.toMatchObject({ statusCode: 409 })
  })
  it.each(['cancel', 'source'])('fences %s changing during output storage', async (race) => {
    const f = fixture()
    f.storage.put.mockImplementationOnce(async () => {
      if (race === 'cancel')
        f.row.status = 'cancelling'
      else
        f.current.canvas_data.z++
    })
    await expect(f.authority.service(completion(f.row))).rejects.toMatchObject({ statusCode: 409 })
    expect(f.row.status).not.toBe('succeeded')
    expect(f.storage.put).toHaveBeenCalledOnce()
  })
  it('does not retry a transaction or remove output on a lost commit response', async () => {
    const f = fixture()
    let transactions = 0
    f.tx.mockImplementation(async (callback) => {
      const result = await callback({ query: f.query })
      if (++transactions === 2)
        throw new Error('lost commit')
      return result
    })
    await expect(f.authority.service(completion(f.row))).rejects.toThrow('lost commit')
    expect(f.storage.put).toHaveBeenCalledOnce()
    expect(f.tx).toHaveBeenCalledTimes(2)
  })
})
