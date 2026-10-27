import zlib from 'node:zlib'

interface SyncInflateOptions {
  chunkSize?: number
  maxLength?: number
}

export default function boundedInflateSync(buffer: Buffer, options: SyncInflateOptions = {}) {
  return zlib.inflateSync(buffer, {
    chunkSize: Math.max(options.chunkSize || 16 * 1024, zlib.Z_MIN_CHUNK),
    ...(options.maxLength == null ? {} : { maxOutputLength: options.maxLength })
  })
}
