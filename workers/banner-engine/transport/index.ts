import { mkdir } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { validateBannerEnginePng } from '../../../server/utils/banner/engineResult'
import { assertBannerEngineResultBinding, assertExecutableBannerEngineRequest, bannerEngineCapabilitySchema } from '../../../shared/bannerEngine'
import { ENGINE_JOB_LIMITS, engineJobClaimSchema, engineJobEngineSchema, engineJobInputSchema, engineJobStatusResponseSchema, engineJobTerminationSchema } from '../../../shared/bannerEngineJobs'
import { bannerEngineOutputArtifactId, runEngineAttempt, type EngineAdapter, type EngineAttemptOutcome, type EngineFailureCode } from '../runner/index'
import { digest, privateRoot, readPrivate, syncDirectory, writeJournal, writePrivate } from './files'
import { createEngineHttp, EngineTransportError, type EngineHttpConfiguration } from './http'

export interface EngineWorkerConfiguration extends EngineHttpConfiguration {
  stagingRoot: string
  workspaceRoot: string
  adapter: EngineAdapter
  pollIntervalMs?: number
  abortGraceMs?: number
  signal?: AbortSignal
}
export type EngineWorkerOutcome = { status: 'idle' } | {
  status: 'succeeded' | 'failed' | 'uncertain'
  jobId?: string
  attemptId?: string
  code?: EngineFailureCode | 'transport-failed'
}
type Termination = 'not-started' | 'adapter-settled' | 'unconfirmed'

/** One pull, one durable claim, at most one execution and one terminal upload. */
export async function runEngineWorkerOnce(configuration: EngineWorkerConfiguration): Promise<EngineWorkerOutcome> {
  const http = createEngineHttp(configuration)
  const interval = configuration.pollIntervalMs ?? 1000
  const capability = bannerEngineCapabilitySchema.safeParse(configuration.adapter.capability)
  if (!capability.success || !engineJobEngineSchema.safeParse(capability.data.engine).success
    || !Number.isSafeInteger(interval) || interval < 1 || interval > 5000
    || !isAbsolute(configuration.stagingRoot) || !isAbsolute(configuration.workspaceRoot)
    || (configuration.abortGraceMs !== undefined && (!Number.isSafeInteger(configuration.abortGraceMs)
      || configuration.abortGraceMs < 1 || configuration.abortGraceMs > 10000)))
    throw new Error('Invalid worker configuration')
  if (configuration.signal?.aborted) return { status: 'failed', code: 'cancelled' }
  let stagingRoot: string, workspaceRoot: string
  try {
    stagingRoot = await privateRoot(configuration.stagingRoot)
    workspaceRoot = await privateRoot(configuration.workspaceRoot)
    if (stagingRoot === workspaceRoot) throw new Error()
  } catch { throw new Error('Invalid worker configuration') }
  let claim
  try {
    claim = engineJobClaimSchema.parse(await http({ action: 'claim', engine: engineJobEngineSchema.parse(capability.data.engine) }, configuration.signal))
    if (claim.request === null) return { status: 'idle' }
    assertExecutableBannerEngineRequest(claim.request, { capabilities: [capability.data], now: Date.now() })
  } catch { return { status: 'uncertain', code: 'transport-failed' } }
  const { request, claimToken } = claim
  const identity = { jobId: request.jobId, attemptId: request.attemptId }
  const binding = { ...identity, claimToken }
  const directory = join(stagingRoot, digest(request.attemptId.toLowerCase()))
  const journal = { version: 1, ...identity, requestSha256: digest(JSON.stringify(request)), automaticRetry: false }
  try {
    await mkdir(directory, { mode: 0o700 })
    await syncDirectory(stagingRoot)
    await writeJournal(directory, { ...journal, state: 'claimed' })
  } catch (error) {
    return { ...identity, status: 'uncertain', code: (error as NodeJS.ErrnoException).code === 'EEXIST' ? 'duplicate-attempt' : 'workspace-failed' }
  }
  const controller = new AbortController()
  let stopped: EngineFailureCode | 'transport-failed' | undefined
  let uncertain = false
  const stop = (code: EngineFailureCode | 'transport-failed', unknown = false) => {
    uncertain ||= unknown
    stopped ??= code
    controller.abort()
  }
  const cancel = () => stop('cancelled')
  configuration.signal?.addEventListener('abort', cancel, { once: true })
  if (configuration.signal?.aborted) cancel()
  const endAt = Math.min(Date.parse(request.deadlineAt), Date.now() + request.limits.timeoutMs)
  const deadline = setTimeout(() => stop('deadline-exceeded'), Math.max(0, endAt - Date.now()))
  const fence = () => {
    if (Date.now() >= endAt) stop('deadline-exceeded')
    if (stopped) throw new Error('Attempt stopped')
  }
  const checkStatus = async () => {
    try {
      const { status } = engineJobStatusResponseSchema.parse(await http({ action: 'status', ...binding }, controller.signal))
      if (status !== 'running') {
        if (status === 'cancelled' || status === 'cancelling') stop('cancelled')
        else if (status === 'expired') stop('deadline-exceeded')
        else stop('transport-failed', true)
      }
    } catch {
      if (!stopped) stop('transport-failed', true)
    }
  }
  let polling: Promise<void> | undefined
  let pollingStopped = false
  let wakePoll: (() => void) | undefined
  const poll = async () => {
    while (!pollingStopped && !stopped) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, interval)
        wakePoll = () => {
          clearTimeout(timer)
          resolve()
        }
      })
      wakePoll = undefined
      if (pollingStopped || stopped) return
      await checkStatus()
    }
  }
  const stopPolling = async () => {
    pollingStopped = true
    wakePoll?.()
    await polling
  }
  let termination: Termination = 'not-started'
  let runner: EngineAttemptOutcome | undefined
  let phase: EngineFailureCode = 'invalid-input'
  let outcome: EngineWorkerOutcome
  try {
    fence()
    await checkStatus()
    fence()
    polling = poll()
    const input = engineJobInputSchema.parse(await http({ action: 'input', ...binding }, controller.signal))
    const bytes = Buffer.from(input.base64, 'base64')
    if (bytes.length !== request.input.bytes || digest(bytes) !== request.input.sha256) throw new Error('Invalid input')
    const inputPath = join(directory, 'input.native')
    await writePrivate(inputPath, bytes)
    fence()
    phase = 'engine-failed'
    // From this point until a durable runner receipt confirms otherwise, assume
    // owned execution may exist. Never infer termination from a thrown error.
    termination = 'unconfirmed'
    runner = await runEngineAttempt({ request, inputPath, signal: controller.signal }, {
      stagingRoot, workspaceRoot, adapter: configuration.adapter, abortGraceMs: configuration.abortGraceMs
    })
    await stopPolling()
    if (runner.status === 'failed') {
      phase = runner.code
      if (runner.receiptPath) {
        try {
          const receipt = JSON.parse((await readPrivate(workspaceRoot, runner.receiptPath, ENGINE_JOB_LIMITS.controlBytes)).toString('utf8'))
          if (receipt.state !== 'failed' || receipt.jobId !== request.jobId || receipt.attemptId !== request.attemptId
            || receipt.requestSha256 !== journal.requestSha256 || receipt.code !== runner.code) throw new Error()
          termination = engineJobTerminationSchema.parse(receipt.termination)
        } catch { termination = 'unconfirmed' }
      } else if (['invalid-request', 'unsupported-capability', 'cancelled', 'deadline-exceeded'].includes(runner.code)) {
        termination = 'not-started'
      }
      if (runner.code === 'duplicate-attempt') uncertain = true
      throw new Error('Runner failed')
    }
    termination = 'adapter-settled'
    fence()
    phase = 'invalid-output'
    const result = assertBannerEngineResultBinding(runner.result, request)
    const receipt = JSON.parse((await readPrivate(workspaceRoot, runner.receiptPath, ENGINE_JOB_LIMITS.controlBytes)).toString('utf8'))
    if (receipt.state !== 'succeeded' || receipt.requestSha256 !== journal.requestSha256
      || receipt.jobId !== request.jobId || receipt.attemptId !== request.attemptId
      || JSON.stringify(receipt.result) !== JSON.stringify(result)) throw new Error('Invalid receipt')
    const output = await readPrivate(workspaceRoot, runner.outputPath, Math.min(request.limits.maxOutputBytes, ENGINE_JOB_LIMITS.outputBytes))
    if (output.length !== result.output.bytes || digest(output) !== result.output.sha256
      || result.output.id !== bannerEngineOutputArtifactId(request.attemptId)
      || result.evidence.executableSha256 !== capability.data.executableSha256
      || result.evidence.capabilityProofSha256 !== capability.data.capabilityProofSha256) throw new Error('Invalid output')
    validateBannerEnginePng(output, request)
    await checkStatus()
    fence()
    // The request may be accepted even if its response is lost. No retry, no
    // failure upload and no destructive cleanup is permitted beyond this point.
    try {
      const accepted = engineJobStatusResponseSchema.parse(await http({ action: 'complete', ...binding, result, outputBase64: output.toString('base64') }, controller.signal))
      outcome = accepted.status === 'succeeded'
        ? { ...identity, status: 'succeeded' }
        : { ...identity, status: 'uncertain', code: 'transport-failed' }
    } catch { outcome = { ...identity, status: 'uncertain', code: 'transport-failed' } }
  } catch (error) {
    await stopPolling()
    const code = stopped ?? (error instanceof EngineTransportError ? 'transport-failed' : phase)
    uncertain ||= error instanceof EngineTransportError && !stopped
    if (uncertain) outcome = { ...identity, status: 'uncertain', code }
    else {
      try {
        const accepted = engineJobStatusResponseSchema.parse(await http({ action: 'fail', ...binding, code, termination }))
        outcome = { ...identity, status: ['failed', 'cancelled', 'expired'].includes(accepted.status) && termination !== 'unconfirmed' ? 'failed' : 'uncertain', code }
      } catch { outcome = { ...identity, status: 'uncertain', code: 'transport-failed' } }
    }
  } finally {
    clearTimeout(deadline)
    configuration.signal?.removeEventListener('abort', cancel)
    await stopPolling()
  }
  try {
    await writeJournal(directory, { ...journal, state: outcome.status, code: 'code' in outcome ? outcome.code : undefined, termination }, true)
  } catch { return { ...identity, status: 'uncertain', code: 'receipt-failed' } }
  return outcome
}
