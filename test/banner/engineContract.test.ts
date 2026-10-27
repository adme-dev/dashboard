import { describe, expect, it } from 'vitest'
import {
  assertExecutableBannerEngineRequest,
  bannerEngineRequestSchema,
  bannerEngineResultSchema,
  type BannerEngineCapability,
  type BannerEngineRequest
} from '../../shared/bannerEngine'

const now = Date.parse('2026-10-27T03:00:00Z')
const id = '23c1889b-f7bc-4da5-a01a-1572eb3f2638'
const hash = 'a'.repeat(64)
function request(): BannerEngineRequest {
  return {
    version: 1, jobId: id, attemptId: id, projectId: id, clientId: null,
    sourceRevision: '2026-10-27T02:00:00.000Z', sourceHash: hash,
    engine: { id: 'photocraft', version: '0.16.0' }, operation: 'render-preview',
    input: { id, sha256: hash, bytes: 100, mimeType: 'application/x-photocraft' },
    output: { mimeType: 'image/png', width: 100, height: 100 },
    limits: { maxInputBytes: 1024, maxOutputBytes: 4096, maxPixels: 10000, timeoutMs: 1000, memoryMb: 256, cpuCount: 1, maxProcesses: 16, maxLogBytes: 1024 },
    deadlineAt: '2026-10-27T03:00:01.000Z'
  }
}
function capability(): BannerEngineCapability {
  return { engine: request().engine, operation: 'render-preview', inputMimeType: request().input.mimeType, executableSha256: hash, capabilityProofSha256: 'b'.repeat(64) }
}
describe('versioned engine request boundary', () => {
  it('allows a null client explicitly and returns an owned parsed snapshot', () => {
    const source = request()
    const parsed = bannerEngineRequestSchema.parse(source)
    source.input.bytes = 5
    expect(parsed.clientId).toBeNull()
    expect(parsed.input.bytes).toBe(100)
  })
  it.each(['photocraft', 'vectorcraft', 'effectcraft', 'filmcraft', 'figcraft', 'soundcraft'])('recognizes %s without granting execution', (engine) => {
    const value = { ...request(), engine: { id: engine, version: '0.16.0' } }
    expect(bannerEngineRequestSchema.safeParse(value).success).toBe(true)
    expect(() => assertExecutableBannerEngineRequest(value, { capabilities: [], now })).toThrow()
  })
  it('requires exact registered version, MIME and operation', () => {
    expect(assertExecutableBannerEngineRequest(request(), { capabilities: [capability()], now })).toEqual(capability())
    for (const mutate of [
      (r: BannerEngineRequest) => { r.engine.version = '0.17.0' },
      (r: BannerEngineRequest) => { r.input.mimeType = 'application/zip' },
      (r: BannerEngineRequest) => { r.engine.id = 'vectorcraft' }
    ]) {
      const value = request()
      mutate(value)
      expect(() => assertExecutableBannerEngineRequest(value, { capabilities: [capability()], now })).toThrow()
    }
  })
  it.each(['command', 'script', 'url', 'path', 'outputPath'])('rejects job-supplied %s at root and nested input', (key) => {
    expect(bannerEngineRequestSchema.safeParse({ ...request(), [key]: '/tmp/anything' }).success).toBe(false)
    expect(bannerEngineRequestSchema.safeParse({ ...request(), input: { ...request().input, [key]: 'https://example.com' } }).success).toBe(false)
  })
  it.each([
    { version: 2 }, { jobId: '../job' }, { attemptId: 'not-uuid' }, { clientId: undefined },
    { sourceHash: 'A'.repeat(64) }, { sourceRevision: '' }, { sourceRevision: '/tmp/source' },
    { operation: 'execute-script' }, { engine: { id: 'photocraft', version: 'latest' } },
    { deadlineAt: 'never' }
  ])('rejects malformed identity/operation %j', (patch) => {
    expect(bannerEngineRequestSchema.safeParse({ ...request(), ...patch }).success).toBe(false)
  })
  it('rejects missing or forged capability proof and ambiguous registrations', () => {
    expect(() => assertExecutableBannerEngineRequest(request(), { capabilities: [{ ...capability(), executableSha256: '' }], now })).toThrow()
    expect(() => assertExecutableBannerEngineRequest(request(), { capabilities: [capability(), capability()], now })).toThrow()
  })
  it('rejects expired and unbounded deadlines', () => {
    for (const clock of [now + 1000, now + 2000, now - 3600000, NaN]) {
      expect(() => assertExecutableBannerEngineRequest(request(), { capabilities: [capability()], now: clock })).toThrow()
    }
  })
  it('rejects excessive inputs, dimensions and invalid resource limits', () => {
    const values = [
      { ...request(), input: { ...request().input, bytes: 1025 } },
      { ...request(), output: { ...request().output, width: 101 } },
      { ...request(), output: { ...request().output, width: 0 } },
      ...['maxInputBytes', 'maxOutputBytes', 'maxPixels', 'timeoutMs', 'memoryMb', 'cpuCount', 'maxProcesses', 'maxLogBytes'].flatMap(key => [0, -1, 0.5, Infinity, 2 ** 40].map(value => ({ ...request(), limits: { ...request().limits, [key]: value } })))
    ]
    for (const value of values) expect(bannerEngineRequestSchema.safeParse(value).success).toBe(false)
  })
  it('admits runtime preview evidence only, never editable import or arbitrary fields', () => {
    const { limits: _limits, deadlineAt: _deadlineAt, ...base } = request()
    const result = { ...base, status: 'succeeded', output: { id, sha256: hash, bytes: 100, mimeType: 'image/png', width: 100, height: 100 }, evidence: { kind: 'runtime-preview', editableImport: false, executableSha256: hash, capabilityProofSha256: hash } }
    expect(bannerEngineResultSchema.safeParse(result).success).toBe(true)
    expect(bannerEngineResultSchema.safeParse({ ...result, evidence: { ...result.evidence, editableImport: true } }).success).toBe(false)
    expect(bannerEngineResultSchema.safeParse({ ...result, proposal: { layers: [] } }).success).toBe(false)
    expect(bannerEngineResultSchema.safeParse({ ...result, evidence: { ...result.evidence, log: 'untrusted' } }).success).toBe(false)
  })
})
