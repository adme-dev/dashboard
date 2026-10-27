import { describe, expect, it } from 'vitest'
import {
  ENGINE_JOB_LIMITS, engineJobClaimSchema, engineJobServiceActionSchema,
  engineJobSubmitSchema, isEngineJobBase64
} from '../../shared/bannerEngineJobs'

const id = '23c1889b-f7bc-4da5-a01a-1572eb3f2638'
const engine = { id: 'photocraft', version: '0.16.0' }
const submit = () => ({
  requestId: id, projectId: id, sourceRevision: '2026-10-27T03:00:00.000Z', engine,
  input: { mimeType: 'application/x-photocraft', base64: 'YQ==' },
  output: { width: 100, height: 100 }
})
const claim = () => ({
  claimToken: 'a'.repeat(64),
  request: {
    version: 1, jobId: id, attemptId: id, projectId: id, clientId: null,
    sourceRevision: '2026-10-27T03:00:00.000Z', sourceHash: 'b'.repeat(64), engine,
    operation: 'render-preview', input: { id, sha256: 'c'.repeat(64), bytes: 1, mimeType: 'application/x-photocraft' },
    output: { mimeType: 'image/png', width: 100, height: 100 },
    limits: { maxInputBytes: 1024, maxOutputBytes: 4096, maxPixels: 10000, timeoutMs: 1000, memoryMb: 256, cpuCount: 1, maxProcesses: 16, maxLogBytes: 1024 },
    deadlineAt: '2026-10-27T03:01:00.000Z'
  }
})
describe('engine job wire boundary', () => {
  it('accepts bounded submission without user supplied tenant or job authority', () => {
    expect(engineJobSubmitSchema.parse(submit())).toEqual(submit())
    for (const key of ['clientId', 'jobId', 'attemptId', 'limits', 'url', 'command', 'storageKey']) {
      expect(engineJobSubmitSchema.safeParse({ ...submit(), [key]: id }).success).toBe(false)
    }
  })
  it.each(['effectcraft', 'filmcraft', 'figcraft', 'soundcraft'])('does not activate %s from vocabulary alone', (name) => {
    expect(engineJobSubmitSchema.safeParse({ ...submit(), engine: { ...engine, id: name } }).success).toBe(false)
  })
  it.each(['', 'YQ', 'YQ=', 'YR==', 'YWJ=', 'Y Q==', 'YQ==\n', 'YQ===', '____', '===='])('rejects noncanonical base64 %j before decoding', (encoded) => {
    expect(isEngineJobBase64(encoded, 10)).toBe(false)
  })
  it('checks decoded size, including padding, at exact boundary', () => {
    for (const count of [1, 2, 3, 4, 5, 1024]) {
      const encoded = Buffer.alloc(count, 255).toString('base64')
      expect(isEngineJobBase64(encoded, count)).toBe(true)
      expect(isEngineJobBase64(encoded, count - 1)).toBe(false)
    }
  })
  it('rejects generic URLs, extra nested fields and overlarge dimensions', () => {
    expect(engineJobSubmitSchema.safeParse({ ...submit(), input: { ...submit().input, url: 'https://example.com' } }).success).toBe(false)
    expect(engineJobSubmitSchema.safeParse({ ...submit(), output: { width: 2049, height: 1 } }).success).toBe(false)
    expect(engineJobSubmitSchema.safeParse({ ...submit(), sourceRevision: 'latest' }).success).toBe(false)
  })
  it('rejects own prototype fields even when Zod would omit them', () => {
    const value = JSON.parse(JSON.stringify(submit()))
    Object.defineProperty(value.input, '__proto__', { value: {}, enumerable: true })
    expect(engineJobSubmitSchema.safeParse(value).success).toBe(false)
    const response = JSON.parse('{"request":null,"__proto__":{}}')
    expect(engineJobClaimSchema.safeParse(response).success).toBe(false)
  })
  it('bounds malformed object graphs without recursive traversal', () => {
    const cyclic: Record<string, unknown> = { request: null }
    cyclic.child = cyclic
    expect(engineJobClaimSchema.safeParse(cyclic).success).toBe(false)
    expect(engineJobClaimSchema.safeParse({ request: null, extra: Array.from({ length: 500 }, () => ({})) }).success).toBe(false)
  })
  it('binds all service actions except claim to attempt credentials', () => {
    expect(engineJobServiceActionSchema.parse({ action: 'claim', engine })).toEqual({ action: 'claim', engine })
    for (const action of ['input', 'status']) {
      expect(engineJobServiceActionSchema.safeParse({ action, jobId: id, attemptId: id }).success).toBe(false)
      expect(engineJobServiceActionSchema.safeParse({ action, jobId: id, attemptId: id, claimToken: 'a'.repeat(64) }).success).toBe(true)
    }
  })
  it('restricts failure reports to content-free codes and termination states', () => {
    const failure = { action: 'fail', jobId: id, attemptId: id, claimToken: 'a'.repeat(64), code: 'transport-failed', termination: 'unconfirmed' }
    expect(engineJobServiceActionSchema.safeParse(failure).success).toBe(true)
    expect(engineJobServiceActionSchema.safeParse({ ...failure, code: 'Secret credentials in exception' }).success).toBe(false)
    expect(engineJobServiceActionSchema.safeParse({ ...failure, termination: 'probably-stopped' }).success).toBe(false)
    expect(engineJobServiceActionSchema.safeParse({ ...failure, logs: 'private document text' }).success).toBe(false)
  })
  it('accepts an empty queue and enforces application limits on claimed runner requests', () => {
    expect(engineJobClaimSchema.parse({ request: null })).toEqual({ request: null })
    expect(engineJobClaimSchema.safeParse(claim()).success).toBe(true)
    for (const limits of [
      { maxInputBytes: ENGINE_JOB_LIMITS.inputBytes + 1 },
      { maxOutputBytes: ENGINE_JOB_LIMITS.outputBytes + 1 },
      { maxPixels: ENGINE_JOB_LIMITS.pixels + 1 },
      { timeoutMs: ENGINE_JOB_LIMITS.timeoutMs + 1 }
    ]) {
      const value = claim()
      Object.assign(value.request.limits, limits)
      expect(engineJobClaimSchema.safeParse(value).success).toBe(false)
    }
  })
})
