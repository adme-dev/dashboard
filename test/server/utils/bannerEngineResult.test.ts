import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { validateBannerEnginePng, validateBannerEngineResult } from '../../../server/utils/banner/engineResult'
import type { BannerEngineCapability, BannerEngineRequest } from '../../../shared/bannerEngine'

const id = '23c1889b-f7bc-4da5-a01a-1572eb3f2638'
const otherId = '33c1889b-f7bc-4da5-a01a-1572eb3f2638'
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function png(width: number, height: number) {
  const image = new PNG({ width, height })
  image.data.fill(255)
  return PNG.sync.write(image)
}
function fixture() {
  const inputBytes = Buffer.from('opaque native input bytes; adapter owns format inspection')
  const outputBytes = png(2, 3)
  const request: BannerEngineRequest = {
    version: 1, jobId: id, attemptId: id, projectId: id, clientId: id, sourceRevision: '1', sourceHash: 'a'.repeat(64),
    engine: { id: 'photocraft', version: '0.16.0' }, operation: 'render-preview',
    input: { id, sha256: sha(inputBytes), bytes: inputBytes.length, mimeType: 'application/x-photocraft' },
    output: { mimeType: 'image/png', width: 2, height: 3 },
    limits: { maxInputBytes: 1024, maxOutputBytes: 4096, maxPixels: 6, timeoutMs: 1000, memoryMb: 256, cpuCount: 1, maxProcesses: 16, maxLogBytes: 1024 },
    deadlineAt: '2026-10-27T03:00:01.000Z'
  }
  const capability: BannerEngineCapability = { engine: request.engine, operation: 'render-preview', inputMimeType: request.input.mimeType, executableSha256: 'b'.repeat(64), capabilityProofSha256: 'c'.repeat(64) }
  const { limits: _limits, deadlineAt: _deadlineAt, ...identity } = request
  return {
    request, currentSource: { projectId: id, clientId: id, sourceRevision: '1', sourceHash: 'a'.repeat(64) },
    inputAsset: { ...request.input, projectId: id, clientId: id }, inputBytes, outputBytes,
    outputAssetId: otherId, capabilities: [capability], now: Date.parse('2026-10-27T03:00:00Z'),
    result: { ...identity, status: 'succeeded' as const, output: { ...request.output, id: otherId, bytes: outputBytes.length, sha256: sha(outputBytes) }, evidence: { kind: 'runtime-preview' as const, editableImport: false as const, executableSha256: capability.executableSha256, capabilityProofSha256: capability.capabilityProofSha256 } }
  }
}
describe('engine result authority and actual-byte boundary', () => {
  it('allows runner PNG validation without granting result authority and retains byte caps', () => {
    const value = fixture()
    expect(() => validateBannerEnginePng(value.outputBytes, value.request)).not.toThrow()
    expect(() => validateBannerEnginePng(value.outputBytes, { ...value.request, limits: { ...value.request.limits, maxOutputBytes: 1 } })).toThrow()
    expect(() => validateBannerEnginePng(value.outputBytes, { ...value.request, limits: { ...value.request.limits, maxPixels: Infinity } })).toThrow()
  })
  it('returns a detached verified PNG and receipt, including nullable client jobs', () => {
    const value = fixture()
    const validated = validateBannerEngineResult(value)
    value.outputBytes.fill(0)
    value.result.output.sha256 = 'd'.repeat(64)
    expect(validated.outputBytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(validated.result.output.sha256).toBe(sha(validated.outputBytes))
    const unscoped = fixture()
    const nullable = { ...unscoped, request: { ...unscoped.request, clientId: null }, result: { ...unscoped.result, clientId: null }, currentSource: { ...unscoped.currentSource, clientId: null }, inputAsset: { ...unscoped.inputAsset, clientId: null } }
    expect(validateBannerEngineResult(nullable).result.clientId).toBeNull()
  })
  it.each(['jobId', 'attemptId', 'projectId', 'clientId', 'sourceRevision', 'sourceHash'] as const)('rejects a result with mismatched %s', (key) => {
    const value = fixture()
    value.result = { ...value.result, [key]: key === 'sourceRevision' ? '2' : key === 'sourceHash' ? 'd'.repeat(64) : otherId }
    expect(() => validateBannerEngineResult(value)).toThrow()
  })
  it.each(['projectId', 'clientId', 'sourceRevision', 'sourceHash'] as const)('rejects stale or cross-tenant current %s', (key) => {
    const value = fixture()
    value.currentSource[key] = key === 'sourceRevision' ? '2' : key === 'sourceHash' ? 'd'.repeat(64) : otherId
    expect(() => validateBannerEngineResult(value)).toThrow()
  })
  it.each(['projectId', 'clientId', 'id', 'sha256', 'bytes', 'mimeType'] as const)('rejects unowned or altered registered input %s', (key) => {
    const value = fixture()
    value.inputAsset = { ...value.inputAsset, [key]: key === 'bytes' ? 5 : key === 'sha256' ? 'd'.repeat(64) : key === 'mimeType' ? 'application/zip' : otherId }
    expect(() => validateBannerEngineResult(value)).toThrow()
  })
  it('rejects result input substitutions and engine changes', () => {
    const value = fixture()
    expect(() => validateBannerEngineResult({ ...value, result: { ...value.result, input: { ...value.result.input, sha256: 'd'.repeat(64) } } })).toThrow()
    expect(() => validateBannerEngineResult({ ...value, result: { ...value.result, engine: { ...value.result.engine, version: '0.17.0' } } })).toThrow()
  })
  it('rejects altered actual input bytes even when result/request still agree', () => {
    const value = fixture()
    value.inputBytes[0] ^= 1
    expect(() => validateBannerEngineResult(value)).toThrow()
  })
  it('rejects false output ownership, evidence pins, hash, size and dimensions', () => {
    const value = fixture()
    for (const output of [
      { ...value.result.output, id }, { ...value.result.output, sha256: 'd'.repeat(64) },
      { ...value.result.output, bytes: 1 }, { ...value.result.output, width: 3 }
    ]) expect(() => validateBannerEngineResult({ ...value, result: { ...value.result, output } })).toThrow()
    for (const key of ['executableSha256', 'capabilityProofSha256']) {
      expect(() => validateBannerEngineResult({ ...value, result: { ...value.result, evidence: { ...value.result.evidence, [key]: 'd'.repeat(64) } } })).toThrow()
    }
  })
  it('rejects actual output hash and size tampering', () => {
    const value = fixture()
    value.outputBytes[45] ^= 1
    expect(() => validateBannerEngineResult(value)).toThrow()
    const oversized = fixture()
    oversized.request.limits.maxOutputBytes = 1
    expect(() => validateBannerEngineResult(oversized)).toThrow()
  })
  it('rejects invalid PNGs even with self-consistent hashes', () => {
    const base = fixture()
    const alteredCrc = Buffer.from(base.outputBytes)
    alteredCrc[45] ^= 1
    const hugeHeader = Buffer.from(base.outputBytes)
    hugeHeader.writeUInt32BE(0x7fffffff, 16)
    const interlaced = Buffer.from(base.outputBytes)
    interlaced[28] = 1
    const wrongSize = png(3, 2)
    for (const bytes of [Buffer.from('<svg/>'), base.outputBytes.subarray(0, 33), Buffer.concat([base.outputBytes, Buffer.from('trailing')]), alteredCrc, hugeHeader, interlaced, wrongSize]) {
      expect(() => validateBannerEngineResult({ ...base, outputBytes: bytes, result: { ...base.result, output: { ...base.result.output, sha256: sha(bytes), bytes: bytes.length } } })).toThrow()
    }
  })
  it('rejects expired results and capabilities absent from trusted configuration', () => {
    const value = fixture()
    expect(() => validateBannerEngineResult({ ...value, now: value.now + 1000 })).toThrow()
    expect(() => validateBannerEngineResult({ ...value, capabilities: [] })).toThrow()
  })
  it('rejects excessive decompressed scanlines before the decoder can truncate them', () => {
    const value = fixture()
    const compressed = deflateSync(Buffer.alloc(100000, 0))
    const chunk = Buffer.alloc(compressed.length + 12)
    chunk.writeUInt32BE(compressed.length, 0)
    chunk.write('IDAT', 4, 'ascii')
    compressed.copy(chunk, 8)
    chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4)
    const outputBytes = Buffer.concat([value.outputBytes.subarray(0, 33), chunk, value.outputBytes.subarray(-12)])
    expect(() => validateBannerEngineResult({ ...value, outputBytes, result: { ...value.result, output: { ...value.result.output, bytes: outputBytes.length, sha256: sha(outputBytes) } } })).toThrow()
  })
  it('rejects a valid interlaced PNG before entering the unbounded decoder path', () => {
    const value = fixture()
    // A one-pixel Adam7 image has the same scanline layout as a plain PNG.
    const bytes = png(1, 1)
    bytes[28] = 1
    bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29)
    expect(PNG.sync.read(bytes).width).toBe(1)
    const request = { ...value.request, output: { ...value.request.output, width: 1, height: 1 } }
    expect(() => validateBannerEnginePng(bytes, request)).toThrow('Unsupported PNG encoding')
  })
  it('does not treat null client ownership as a wildcard', () => {
    const value = fixture()
    expect(() => validateBannerEngineResult({ ...value, currentSource: { ...value.currentSource, clientId: null } })).toThrow()
    expect(() => validateBannerEngineResult({ ...value, inputAsset: { ...value.inputAsset, clientId: null } })).toThrow()
  })
})
