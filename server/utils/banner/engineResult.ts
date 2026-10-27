import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import { z } from 'zod'
import {
  assertBannerEngineResultBinding,
  assertExecutableBannerEngineRequest,
  bannerEngineRequestSchema,
  bannerEngineSourceSchema,
  type BannerEngineCapability,
  type BannerEngineRequest,
  type BannerEngineResult,
  type BannerEngineSource
} from '../../../shared/bannerEngine'

export interface ValidateBannerEngineResultOptions {
  result: unknown
  /** Loaded from trusted job authority, never reconstructed from the receipt. */
  request: unknown
  /** Fresh authoritative project state. Caller must fence any later write atomically. */
  currentSource: BannerEngineSource
  /** Independently resolved owned asset metadata, not the job's asset claims. */
  inputAsset: BannerEngineRequest['input'] & Pick<BannerEngineSource, 'projectId' | 'clientId'>
  inputBytes: Uint8Array
  /** ID reserved by the trusted caller for this attempt's output. */
  outputAssetId: string
  outputBytes: Uint8Array
  capabilities: readonly BannerEngineCapability[]
  now: number
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  return crc >>> 0
})

// Check every chunk, including ancillary chunks pngjs may skip. This also forbids
// trailers, duplicate headers, APNG, and chunks outside the bounded byte stream.
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!
  return (crc ^ 0xffffffff) >>> 0
}

/** PNG encoding/size check reusable by a runner; does not validate authority or hashes. */
export function validateBannerEnginePng(bytes: Buffer, trustedRequest: BannerEngineRequest): void {
  const request = bannerEngineRequestSchema.parse(trustedRequest)
  if (!Buffer.isBuffer(bytes) || bytes.byteLength > request.limits.maxOutputBytes) throw new Error('PNG exceeds job byte limit')
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(pngSignature)
    || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG header')
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width !== request.output.width || height !== request.output.height || width * height > request.limits.maxPixels) throw new Error('PNG dimensions differ from trusted request')
  // Keep decode allocations bounded. In pngjs the interlaced path has an
  // unbounded inflate; v1 deliberately accepts only noninterlaced 8-bit images.
  if (bytes[24] !== 8 || ![0, 2, 3, 4, 6].includes(bytes[25]!)
    || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) throw new Error('Unsupported PNG encoding')
  let offset = 8
  let chunks = 0
  let seenData = false
  let endedData = false
  let seenEnd = false
  while (offset < bytes.length) {
    if (++chunks > 10000 || offset + 12 > bytes.length) throw new Error('Invalid PNG chunk bounds')
    const size = bytes.readUInt32BE(offset)
    const end = offset + 12 + size
    if (end > bytes.length) throw new Error('Truncated PNG chunk')
    const kind = bytes.toString('ascii', offset + 4, offset + 8)
    if (!/^[A-Za-z]{4}$/.test(kind) || ['acTL', 'fcTL', 'fdAT'].includes(kind)) throw new Error('Unsupported PNG chunk')
    if (kind === 'IHDR' && offset !== 8) throw new Error('Duplicate PNG header')
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error('Invalid PNG CRC')
    if (kind === 'IDAT') {
      if (endedData) throw new Error('Noncontiguous PNG data')
      seenData = true
    } else if (seenData) endedData = true
    if (kind === 'IEND') {
      if (size !== 0 || !seenData || end !== bytes.length) throw new Error('Invalid PNG end')
      seenEnd = true
    }
    offset = end
  }
  if (!seenEnd) throw new Error('Missing PNG end')
  const decoded = PNG.sync.read(bytes, { checkCRC: true })
  if (decoded.width !== width || decoded.height !== height || decoded.data.length !== width * height * 4) throw new Error('Invalid decoded PNG')
}

/**
 * Pure synchronous acceptance boundary, with no DB/provider/storage effects.
 * Not authentication, native-document safety inspection, editable import, or a
 * replay ledger. A caller must supply independently authorized context and CAS
 * the project revision/active attempt when persisting this returned snapshot.
 */
export function validateBannerEngineResult(options: ValidateBannerEngineResultOptions): { result: BannerEngineResult, outputBytes: Buffer } {
  const request = bannerEngineRequestSchema.parse(options.request)
  const result = assertBannerEngineResultBinding(options.result, request)
  const capability = assertExecutableBannerEngineRequest(request, { capabilities: options.capabilities, now: options.now })
  const current = bannerEngineSourceSchema.parse(options.currentSource)
  for (const key of ['projectId', 'clientId', 'sourceRevision', 'sourceHash'] as const) {
    if (current[key] !== request[key]) throw new Error(`Current engine source ${key} mismatch`)
  }
  const asset = options.inputAsset
  if (asset.projectId !== request.projectId || asset.clientId !== request.clientId) throw new Error('Engine input asset ownership mismatch')
  for (const key of ['id', 'sha256', 'bytes', 'mimeType'] as const) {
    if (asset[key] !== request.input[key]) throw new Error(`Trusted engine input ${key} mismatch`)
  }
  if (z.string().uuid().parse(options.outputAssetId) !== result.output.id) throw new Error('Engine output asset identity mismatch')
  if (result.evidence.executableSha256 !== capability.executableSha256
    || result.evidence.capabilityProofSha256 !== capability.capabilityProofSha256) throw new Error('Engine execution evidence pin mismatch')
  // Check lengths before copying/decoding any untrusted buffers.
  if (!(options.inputBytes instanceof Uint8Array) || options.inputBytes.byteLength !== request.input.bytes
    || !(options.outputBytes instanceof Uint8Array) || options.outputBytes.byteLength !== result.output.bytes
    || options.outputBytes.byteLength > request.limits.maxOutputBytes) throw new Error('Engine artifact byte length mismatch')
  const input = Buffer.from(options.inputBytes)
  const output = Buffer.from(options.outputBytes)
  if (sha256(input) !== request.input.sha256 || sha256(output) !== result.output.sha256) throw new Error('Engine artifact digest mismatch')
  validateBannerEnginePng(output, request)
  return { result, outputBytes: output }
}
