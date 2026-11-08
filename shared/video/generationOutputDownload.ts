export const MAX_GENERATION_OUTPUT_BYTES = 32 * 1024 * 1024
export const DEFAULT_GENERATION_OUTPUT_TIMEOUT_MS = 30_000

const MAX_TIMER_DELAY_MS = 2_147_483_647

export interface GenerationOutputDownloadOptions {
  maxBytes?: number
  timeoutMs?: number
  signal?: AbortSignal
}

class GenerationOutputDownloadError extends Error {}

function readDeclaredLength(response: Response, limit: number): number | null {
  const header = response.headers.get('content-length')
  if (header === null) return null
  const value = header.trim()
  if (!/^\d+$/.test(value)) {
    throw new GenerationOutputDownloadError('Generation output Content-Length is invalid')
  }
  const declared = Number(value)
  if (!Number.isSafeInteger(declared)) {
    throw new GenerationOutputDownloadError('Generation output Content-Length is invalid')
  }
  if (declared > limit) {
    throw new GenerationOutputDownloadError('Generation output exceeds the byte limit')
  }
  return declared
}

function hasValidFtypHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16) return false
  const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
  return boxSize >= 16
    && boxSize % 4 === 0
    && boxSize <= bytes.byteLength
    && bytes[4] === 0x66
    && bytes[5] === 0x74
    && bytes[6] === 0x79
    && bytes[7] === 0x70
}

function concatenate(chunks: Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function readGenerationOutputDownload(
  response: Response,
  options: GenerationOutputDownloadOptions = {}
): Promise<Uint8Array> {
  const limit = options.maxBytes ?? MAX_GENERATION_OUTPUT_BYTES
  const timeoutMs = options.timeoutMs ?? DEFAULT_GENERATION_OUTPUT_TIMEOUT_MS
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_GENERATION_OUTPUT_BYTES) {
    throw new GenerationOutputDownloadError('Generation output byte limit is invalid')
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new GenerationOutputDownloadError('Generation output timeout is invalid')
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>
  try {
    if (!response.body) throw new GenerationOutputDownloadError('Generation output body is empty')
    reader = response.body.getReader()
  } catch (error) {
    if (error instanceof GenerationOutputDownloadError) throw error
    throw new GenerationOutputDownloadError('Generation output body is unavailable')
  }

  const abortController = new AbortController()
  let timedOut = false
  let externallyAborted = false
  let succeeded = false

  const cancelReader = () => {
    void reader.cancel().catch(() => undefined)
  }
  const externalAbort = () => {
    externallyAborted = true
    abortController.abort()
  }
  const abortError = () => new GenerationOutputDownloadError(
    externallyAborted ? 'Generation output download was aborted' : 'Generation output download timed out'
  )
  const readNext = (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    if (abortController.signal.aborted) return Promise.reject(abortError())
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        abortController.signal.removeEventListener('abort', onAbort)
        reject(abortError())
      }
      abortController.signal.addEventListener('abort', onAbort, { once: true })
      let pending: Promise<ReadableStreamReadResult<Uint8Array>>
      try {
        pending = reader.read()
      } catch {
        abortController.signal.removeEventListener('abort', onAbort)
        reject(new GenerationOutputDownloadError('Generation output body could not be read'))
        return
      }
      pending.then(
        (result) => {
          abortController.signal.removeEventListener('abort', onAbort)
          resolve(result)
        },
        () => {
          abortController.signal.removeEventListener('abort', onAbort)
          reject(new GenerationOutputDownloadError('Generation output body could not be read'))
        }
      )
    })
  }

  abortController.signal.addEventListener('abort', cancelReader, { once: true })
  if (options.signal) {
    if (options.signal.aborted) externalAbort()
    else options.signal.addEventListener('abort', externalAbort, { once: true })
  }
  const timer = setTimeout(() => {
    timedOut = true
    abortController.abort()
  }, timeoutMs)

  try {
    if (externallyAborted) throw abortError()
    if (response.redirected) {
      throw new GenerationOutputDownloadError('Generation output response was redirected')
    }
    if (response.status < 200 || response.status >= 300) {
      throw new GenerationOutputDownloadError('Generation output response was not successful')
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'video/mp4') {
      throw new GenerationOutputDownloadError('Generation output Content-Type must be video/mp4')
    }
    const declaredLength = readDeclaredLength(response, limit)
    const chunks: Uint8Array[] = []
    let size = 0

    for (;;) {
      const { done, value } = await readNext()
      if (done) break
      if (value.byteLength > limit - size) {
        throw new GenerationOutputDownloadError('Generation output exceeds the byte limit')
      }
      if (declaredLength !== null && value.byteLength > declaredLength - size) {
        throw new GenerationOutputDownloadError('Generation output does not match Content-Length')
      }
      size += value.byteLength
      chunks.push(value)
    }

    if (size === 0) throw new GenerationOutputDownloadError('Generation output body is empty')
    if (declaredLength !== null && size !== declaredLength) {
      throw new GenerationOutputDownloadError('Generation output does not match Content-Length')
    }
    const bytes = concatenate(chunks, size)
    if (!hasValidFtypHeader(bytes)) {
      throw new GenerationOutputDownloadError('Generation output has an invalid ISO-BMFF ftyp header')
    }
    succeeded = true
    return bytes
  } catch (error) {
    if (timedOut && !externallyAborted) {
      throw new GenerationOutputDownloadError('Generation output download timed out')
    }
    if (error instanceof GenerationOutputDownloadError) throw error
    throw new GenerationOutputDownloadError('Generation output body could not be read')
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', externalAbort)
    abortController.signal.removeEventListener('abort', cancelReader)
    if (!succeeded) cancelReader()
    reader.releaseLock()
  }
}
