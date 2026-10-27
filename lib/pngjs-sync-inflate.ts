import zlib from 'node:zlib'
import { constants } from 'node:buffer'

interface SyncInflateOptions {
  chunkSize?: number
  maxLength?: number
}

export default function boundedInflateSync(buffer: Buffer, options: SyncInflateOptions = {}) {
  const maxLength = options.maxLength
  // workerd's native inflater accounts for output buffer growth, not just the
  // final byte count. Allow fixed allocation headroom, then enforce pngjs's
  // exact decoded-size bound before returning any bytes to its parser.
  const allocationHeadroom = 64 * 1024
  if (maxLength != null && (!Number.isSafeInteger(maxLength) || maxLength < 0
    || maxLength > Math.min(constants.MAX_LENGTH, Number.MAX_SAFE_INTEGER) - allocationHeadroom)) {
    throw new RangeError('Invalid inflate output limit')
  }
  const result = zlib.inflateSync(buffer, {
    chunkSize: Math.max(options.chunkSize || 16 * 1024, zlib.Z_MIN_CHUNK),
    ...(maxLength == null ? {} : { maxOutputLength: maxLength + allocationHeadroom })
  })
  if (maxLength != null && result.length > maxLength) {
    throw new RangeError('Inflated data exceeds output limit')
  }
  return result
}
