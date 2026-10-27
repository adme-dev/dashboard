import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rename } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { validateBannerEnginePng } from '../../../server/utils/banner/engineResult'
import { assertBannerEngineResultBinding, assertExecutableBannerEngineRequest, bannerEngineRequestSchema, type BannerEngineCapability, type BannerEngineRequest, type BannerEngineResult } from '../../../shared/bannerEngine'

export type EngineFailureCode = 'invalid-request' | 'unsupported-capability' | 'invalid-input' | 'invalid-output' | 'duplicate-attempt' | 'cancelled' | 'deadline-exceeded' | 'resource-limit' | 'output-limit' | 'engine-failed' | 'workspace-failed' | 'receipt-failed'
/** A trusted adapter reports classification and cleanup evidence, never diagnostics. */
export class EngineAdapterError extends Error {
  constructor(
    public readonly code: 'resource-limit' | 'engine-failed',
    public readonly termination: 'adapter-settled' | 'unconfirmed' = 'unconfirmed'
  ) { super(code) }
}
export interface EngineAdapterContext {
  request: BannerEngineRequest
  inputPath: string
  outputPath: string
  workspacePath: string
  signal: AbortSignal
  /** Account for every stdout/stderr byte. Content is discarded and never persisted. */
  onOutput: (chunk: string | Uint8Array) => void
}
/** Configuration is operator-owned code, never deserialized from an untrusted job. */
export interface EngineAdapter {
  capability: BannerEngineCapability
  /**
   * Must enforce request limits and terminate owned processes on signal abort.
   * Resolve only after verified cleanup. Rejection confirms cleanup only via an
   * explicit EngineAdapterError termination; arbitrary errors prove no absence.
   */
  run: (context: EngineAdapterContext) => Promise<void>
}
export interface EngineRunnerConfiguration {
  stagingRoot: string
  workspaceRoot: string
  adapter: EngineAdapter
  /** Bounded wait for trusted adapter cleanup after abort, default 5 seconds. */
  abortGraceMs?: number
}
export type EngineAttemptOutcome = {
  status: 'succeeded'
  result: BannerEngineResult
  outputPath: string
  receiptPath: string
} | {
  status: 'failed'
  code: EngineFailureCode
  receiptPath?: string
}
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
class BoundaryError extends Error {
  constructor(readonly code: EngineFailureCode) { super(code) }
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
async function trustedRoot(path: string, create = false): Promise<string> {
  if (!isAbsolute(path))
    throw new Error('Absolute root required')
  if (create)
    await mkdir(path, { recursive: true, mode: 0o700 })
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('Invalid root')
  // System aliases (e.g. macOS /var) are resolved once for trusted configuration.
  return realpath(path)
}
async function checkedPath(root: string, path: string): Promise<string> {
  if (!isAbsolute(path))
    throw new Error('Absolute path required')
  const target = resolve(path)
  const rel = relative(root, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error('Path outside root')
  let current = root
  for (const part of rel.split(sep)) {
    current = join(current, part)
    const info = await lstat(current)
    if (info.isSymbolicLink())
      throw new Error('Symlink rejected')
    if (current !== target && !info.isDirectory())
      throw new Error('Invalid ancestor')
  }
  if (await realpath(target) !== target)
    throw new Error('Noncanonical path')
  return target
}
async function readBounded(root: string, path: string, maxBytes: number): Promise<Buffer> {
  const target = await checkedPath(root, path)
  const before = await lstat(target)
  // NONBLOCK avoids waiting indefinitely if an attacker replaces a file with a FIFO.
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.nlink !== 1 || info.dev !== before.dev || info.ino !== before.ino
      || info.size < 1 || info.size > maxBytes)
      throw new Error('Invalid file')
    const bytes = Buffer.alloc(info.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const read = await file.read(bytes, offset, bytes.length - offset, offset)
      if (!read.bytesRead)
        break
      offset += read.bytesRead
    }
    const after = await file.stat()
    if (offset !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs)
      throw new Error('File changed while reading')
    await checkedPath(root, target)
    return bytes.subarray(0, offset)
  } finally {
    await file.close()
  }
}
async function syncDirectory(path: string): Promise<void> {
  const file = await open(path, constants.O_RDONLY)
  try {
    await file.sync()
  } finally {
    await file.close()
  }
}
async function writeOwned(path: string, bytes: string | Uint8Array, mode = 0o400): Promise<void> {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
  await syncDirectory(dirname(path))
}
async function writeReceipt(path: string, value: object, terminal = false): Promise<void> {
  const target = terminal ? `${path}.terminal` : path
  await writeOwned(target, `${JSON.stringify(value)}\n`, 0o600)
  if (terminal) {
    await rename(target, path)
    await syncDirectory(dirname(path))
  }
}
/** Reserve this identity before execution; never trust an ID supplied by a result. */
export function bannerEngineOutputArtifactId(attemptId: string): string {
  z.string().uuid().parse(attemptId)
  const hash = digest(`banner-engine-preview:${attemptId.toLowerCase()}`)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
/**
 * One local execution attempt. This is neither a queue nor an authority database.
 * Keep the private workspace root durable across deliveries/restarts: deleting an
 * attempt directory removes the replay hold. An existing claim ALWAYS fails closed.
 */
export async function runEngineAttempt(input: {
  request: unknown
  inputPath: string
  signal?: AbortSignal
}, configuration: EngineRunnerConfiguration): Promise<EngineAttemptOutcome> {
  const parsed = bannerEngineRequestSchema.safeParse(input.request)
  if (!parsed.success)
    return { status: 'failed', code: 'invalid-request' }
  const request = freeze(parsed.data)
  const startedAt = Date.now()
  const endAt = Math.min(Date.parse(request.deadlineAt), startedAt + request.limits.timeoutMs)
  if (endAt <= startedAt)
    return { status: 'failed', code: 'deadline-exceeded' }
  let capability: BannerEngineCapability
  try {
    capability = assertExecutableBannerEngineRequest(request, { capabilities: [configuration.adapter.capability], now: startedAt })
  } catch {
    return { status: 'failed', code: 'unsupported-capability' }
  }
  if (input.signal?.aborted)
    return { status: 'failed', code: 'cancelled' }
  let attemptPath: string, stagingRoot: string
  try {
    stagingRoot = await trustedRoot(configuration.stagingRoot)
    const workspaceRoot = await trustedRoot(configuration.workspaceRoot, true)
    attemptPath = join(workspaceRoot, digest(request.attemptId.toLowerCase()))
    try {
      await mkdir(attemptPath, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        return { status: 'failed', code: 'duplicate-attempt' }
      throw error
    }
    await syncDirectory(workspaceRoot)
  } catch {
    return { status: 'failed', code: 'workspace-failed' }
  }
  const receiptPath = join(attemptPath, 'receipt.json')
  const binding = {
    version: 1, jobId: request.jobId, attemptId: request.attemptId,
    requestSha256: digest(JSON.stringify(request)), automaticRetry: false
  }
  try {
    await writeReceipt(receiptPath, { ...binding, state: 'running' })
  } catch {
    return { status: 'failed', code: 'receipt-failed', receiptPath }
  }
  const controller = new AbortController()
  let stopped: EngineFailureCode | undefined
  let rejectStopped!: (error: BoundaryError) => void
  const stopping = new Promise<never>((_, reject) => {
    rejectStopped = reject
  })
  // A staging failure may happen before the adapter race starts.
  void stopping.catch(() => { })
  const stop = (code: EngineFailureCode) => {
    if (stopped)
      return
    stopped = code
    controller.abort()
    rejectStopped(new BoundaryError(code))
  }
  const cancel = () => stop('cancelled')
  input.signal?.addEventListener('abort', cancel, { once: true })
  if (input.signal?.aborted)
    cancel()
  const timer = setTimeout(() => stop('deadline-exceeded'), Math.max(0, endAt - Date.now()))
  const fence = () => {
    if (!stopped && Date.now() >= endAt)
      stop('deadline-exceeded')
    if (stopped)
      throw new BoundaryError(stopped)
  }
  let phase: EngineFailureCode = 'invalid-input'
  let adapterCompletion: Promise<void> | undefined
  let adapterStarted = false
  let adapterSettled = false
  let adapterTerminationConfirmed = false
  try {
    fence()
    const bytes = await readBounded(stagingRoot, input.inputPath, request.limits.maxInputBytes)
    if (bytes.length !== request.input.bytes || digest(bytes) !== request.input.sha256)
      throw new BoundaryError('invalid-input')
    const workspacePath = join(attemptPath, 'work')
    await mkdir(workspacePath, { mode: 0o700 })
    for (const directory of ['input', 'output', 'scratch'])
      await mkdir(join(workspacePath, directory), { mode: 0o700 })
    const inputPath = join(workspacePath, 'input', 'document.native')
    const outputPath = join(workspacePath, 'output', 'preview.png')
    await writeOwned(inputPath, bytes)
    fence()
    let logBytes = 0
    phase = 'engine-failed'
    const onOutput = (chunk: string | Uint8Array) => {
      if (stopped)
        return
      logBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength
      if (logBytes > request.limits.maxLogBytes)
        stop('output-limit')
    }
    adapterCompletion = Promise.resolve().then(() => {
      fence()
      adapterStarted = true
      return configuration.adapter.run({ request, inputPath, outputPath, workspacePath, signal: controller.signal, onOutput })
    }).then(() => {
      adapterTerminationConfirmed = true
    }, (error) => {
      adapterTerminationConfirmed = error instanceof EngineAdapterError && error.termination === 'adapter-settled'
      throw error
    }).finally(() => {
      adapterSettled = true
    })
    await Promise.race([adapterCompletion, stopping])
    fence()
    phase = 'invalid-input'
    const retainedInput = await readBounded(workspacePath, inputPath, request.limits.maxInputBytes)
    if (digest(retainedInput) !== request.input.sha256 || retainedInput.length !== request.input.bytes)
      throw new BoundaryError('invalid-input')
    phase = 'invalid-output'
    const output = await readBounded(workspacePath, outputPath, request.limits.maxOutputBytes)
    validateBannerEnginePng(output, request)
    fence()
    const { limits: _limits, deadlineAt: _deadlineAt, ...identity } = request
    const result = assertBannerEngineResultBinding({
      ...identity, status: 'succeeded',
      output: { ...request.output, id: bannerEngineOutputArtifactId(request.attemptId), bytes: output.length, sha256: digest(output) },
      evidence: { kind: 'runtime-preview', editableImport: false, executableSha256: capability.executableSha256, capabilityProofSha256: capability.capabilityProofSha256 }
    }, request)
    // Publish verified bytes outside the adapter workspace; no late adapter write
    // can replace the artifact referenced by the successful receipt.
    const artifactPath = join(attemptPath, 'preview.png')
    await writeOwned(artifactPath, output)
    fence()
    phase = 'receipt-failed'
    await writeReceipt(receiptPath, { ...binding, state: 'succeeded', result }, true)
    fence()
    return { status: 'succeeded', result, outputPath: artifactPath, receiptPath }
  } catch (error) {
    const code = stopped ?? (error instanceof BoundaryError || error instanceof EngineAdapterError ? error.code : phase)
    controller.abort()
    if (adapterCompletion && !adapterSettled) {
      const configuredGrace = configuration.abortGraceMs ?? 5000
      const grace = Number.isFinite(configuredGrace) ? Math.max(1, Math.min(configuredGrace, 10000)) : 5000
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          adapterCompletion.catch(() => {}),
          new Promise<void>((resolve) => {
            cleanupTimer = setTimeout(resolve, grace)
          })
        ])
      } finally {
        clearTimeout(cleanupTimer)
      }
    }
    const termination = !adapterStarted ? 'not-started' : adapterSettled && adapterTerminationConfirmed ? 'adapter-settled' : 'unconfirmed'
    try {
      await writeReceipt(receiptPath, { ...binding, state: 'failed', code, termination }, true)
    } catch {
      return { status: 'failed', code: 'receipt-failed', receiptPath }
    }
    return { status: 'failed', code, receiptPath }
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener('abort', cancel)
  }
}
