/** Shared data-only execution contract; contains no media URLs or customer copy. */
export const VIDEO_RENDER_WORK_MS = 720_000
export const VIDEO_RENDER_FORMAT_MS = 600_000
export const VIDEO_PROGRESS_INTERVAL_MS = 2_500
export const VIDEO_PROGRESS_REQUEST_MS = 2_000

export type RenderStage = 'rendering' | 'capturing' | 'encoding' | 'uploading' | 'done'
export interface MeasuredRenderProgress {
  stage: RenderStage
  framesDone?: number
  framesTotal?: number
  encodedTimeMs?: number
  durationMs?: number
  bytesDone?: number
  bytesTotal?: number
}
export interface VideoRenderProgress extends MeasuredRenderProgress {
  formatKey: string | null
  done: number
  total: number
  updatedAt: string
  /** Internal publication fence; never interpreted as user authority. */
  attemptId?: string
  /** Monotonic within the attempt; rejects delayed advisory writes. */
  sequence?: number
}
export class RenderPublicationUncertainError extends Error {}

/** Deadline failure was durably stored after cleanup; explicit Retry creates a new job. */
export class TerminalRenderDeadlineError extends Error {
  constructor(message: string) { super(message); this.name = 'TerminalRenderDeadlineError' }
}

export class RenderDeadlineError extends Error {
  constructor() { super('container_timeout: Video export exceeded its render-work deadline'); this.name = 'RenderDeadlineError' }
}

export function createRenderDeadline(timeoutMs: number, options: { signal?: AbortSignal; deadlineAtMs?: number } = {}) {
  const controller = new AbortController()
  const deadlineAtMs = Math.min(Date.now() + timeoutMs, options.deadlineAtMs ?? Infinity)
  const cancel = () => controller.abort(options.signal?.reason ?? new RenderDeadlineError())
  let timer: ReturnType<typeof setTimeout> | undefined
  if (options.signal?.aborted) cancel()
  else if (deadlineAtMs <= Date.now()) controller.abort(new RenderDeadlineError())
  else {
    options.signal?.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => controller.abort(new RenderDeadlineError()), deadlineAtMs - Date.now())
  }
  return {
    signal: controller.signal,
    deadlineAtMs,
    remainingMs: () => Math.max(0, deadlineAtMs - Date.now()),
    run<T>(operation: () => Promise<T>, onLateSuccess?: (value: T) => Promise<unknown>): Promise<T> {
      return runWithRenderSignal(controller.signal, operation, onLateSuccess)
    },
    dispose() { if (timer) clearTimeout(timer); options.signal?.removeEventListener('abort', cancel) }
  }
}

/** Race read/compute work against cancellation; never publish a late result. */
export function runWithRenderSignal<T>(signal: AbortSignal, operation: () => Promise<T>, onLateSuccess?: (value: T) => Promise<unknown>): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    let aborted = false
    const onAbort = () => { aborted = true; signal.removeEventListener('abort', onAbort); reject(signal.reason) }
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation() }).then(value => {
      signal.removeEventListener('abort', onAbort)
      if (aborted) { void Promise.resolve().then(() => onLateSuccess?.(value)).catch(() => {}); return }
      resolve(value)
    }, error => { signal.removeEventListener('abort', onAbort); if (!aborted) reject(error) })
  })
}

/** Treat invalid advisory counters as unavailable, never as a render failure. */
export function measuredRenderProgress(value: unknown): MeasuredRenderProgress | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const aliases: Record<string, RenderStage> = { preparing: 'rendering', capturing: 'capturing', encoding: 'encoding', streaming: 'uploading', rendering: 'rendering', uploading: 'uploading' }
  const stage = typeof raw.stage === 'string' && Object.hasOwn(aliases, raw.stage) ? aliases[raw.stage] : undefined
  if (!stage) return null
  const result: MeasuredRenderProgress = { stage }
  for (const [done, total] of [['framesDone', 'framesTotal'], ['encodedTimeMs', 'durationMs'], ['bytesDone', 'bytesTotal']] as const) {
    const d = raw[done], t = raw[total]
    if (typeof d === 'number' && Number.isSafeInteger(d) && d >= 0) result[done] = d
    if (typeof t === 'number' && Number.isSafeInteger(t) && t > 0) result[total] = t
    if (result[done] !== undefined && result[total] !== undefined) result[done] = Math.min(result[done]!, result[total]!)
  }
  return result
}
