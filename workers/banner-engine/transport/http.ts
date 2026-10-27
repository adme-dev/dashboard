import { ENGINE_JOB_LIMITS, ENGINE_JOB_SERVICE_PATH, engineJobServiceActionSchema, type EngineJobServiceAction } from '../../../shared/bannerEngineJobs'

export class EngineTransportError extends Error {
  constructor() { super('Engine transport uncertain') }
}
export interface EngineHttpConfiguration {
  origin: string
  serviceToken: string
  /** Explicit local proof only. Production always requires HTTPS. */
  allowLoopbackHttp?: boolean
  requestTimeoutMs?: number
  fetch?: typeof globalThis.fetch
}

/** Only operator configuration chooses the origin; jobs never supply URLs. */
export function createEngineHttp(configuration: EngineHttpConfiguration) {
  let endpoint: string
  const timeout = configuration.requestTimeoutMs ?? 10000
  try {
    const url = new URL(configuration.origin)
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
    if (configuration.origin !== url.origin && configuration.origin !== `${url.origin}/`)
      throw new Error()
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && configuration.allowLoopbackHttp === true && loopback))
      throw new Error()
    if (!/^[\x21-\x7e]{32,4096}$/.test(configuration.serviceToken)
      || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30000)
      throw new Error()
    endpoint = `${url.origin}${ENGINE_JOB_SERVICE_PATH}`
  } catch {
    throw new Error('Invalid worker configuration')
  }
  const fetch = configuration.fetch ?? globalThis.fetch
  return async (action: EngineJobServiceAction, signal?: AbortSignal): Promise<unknown> => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const timer = setTimeout(abort, timeout)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let rejectAbort!: (error: EngineTransportError) => void
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject
    })
    const onAbort = () => rejectAbort(new EngineTransportError())
    controller.signal.addEventListener('abort', onAbort, { once: true })
    void aborted.catch(() => {})
    try {
      if (controller.signal.aborted) throw new EngineTransportError()
      const body = JSON.stringify(engineJobServiceActionSchema.parse(action))
      const maxRequest = action.action === 'complete' ? ENGINE_JOB_LIMITS.jsonBytes : ENGINE_JOB_LIMITS.controlBytes
      if (Buffer.byteLength(body) > maxRequest) throw new EngineTransportError()
      const pending = fetch(endpoint, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { 'authorization': `Bearer ${configuration.serviceToken}`, 'content-type': 'application/json', 'accept': 'application/json' }, body
      })
      // Fetch implementations must honor abort. Cancel any late response as well.
      void pending.then((response) => {
        if (controller.signal.aborted) void response.body?.cancel().catch(() => {})
      }, () => {})
      const response = await Promise.race([pending, aborted])
      reader = response.body?.getReader()
      if (!response.ok || response.redirected || (response.url && response.url !== endpoint)
        || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json' || !reader)
        throw new EngineTransportError()
      const maxBytes = action.action === 'input' ? ENGINE_JOB_LIMITS.jsonBytes : ENGINE_JOB_LIMITS.controlBytes
      const length = response.headers.get('content-length')
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new EngineTransportError()
      const buffer = Buffer.allocUnsafe(maxBytes)
      const readBody = async () => {
        let size = 0
        let chunkCount = 0
        while (true) {
          if (controller.signal.aborted) throw new EngineTransportError()
          const chunk = await reader!.read()
          if (chunk.done) break
          // Bound per-chunk work too: an endless stream of empty or single-byte
          // chunks must not starve timeout tasks or grow a chunk/reaction list.
          if (++chunkCount > 65536 || !(chunk.value instanceof Uint8Array)
            || chunk.value.byteLength > maxBytes - size) throw new EngineTransportError()
          buffer.set(chunk.value, size)
          size += chunk.value.byteLength
        }
        return buffer.subarray(0, size)
      }
      // One deadline listener for the whole body, not one retained reaction per
      // chunk. Actual bytes stay in one bounded allocation.
      const bytes = await Promise.race([readBody(), aborted])
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch {
      throw new EngineTransportError()
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      controller.signal.removeEventListener('abort', onAbort)
      controller.abort()
      // Do not await a hostile/failed stream's cancellation promise.
      if (reader) void reader.cancel().catch(() => {})
    }
  }
}
