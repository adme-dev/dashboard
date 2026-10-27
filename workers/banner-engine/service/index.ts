import { join } from 'node:path'
import { bannerEngineCapabilitySchema } from '../../../shared/bannerEngine'
import { createEngineHttp } from '../transport/http'
import {
  runEngineWorkerOnce,
  type EngineWorkerConfiguration,
  type EngineWorkerOutcome
} from '../transport/index'
import {
  acquireAdmission,
  inspectAdmission,
  validateStorage,
  type HoldReason,
  type HostStorage
} from './admission'

type ServiceWorkers = Array<
  Omit<EngineWorkerConfiguration, 'stagingRoot' | 'workspaceRoot' | 'signal'>
>
export interface EngineServiceConfiguration extends HostStorage {
  /** Literal opt-in; callers must not coerce environment strings to booleans. */
  enabled?: string
  workers: ServiceWorkers | (() => Promise<ServiceWorkers>)
  signal?: AbortSignal
  idleMinMs?: number
  idleMaxMs?: number
  shutdownGraceMs?: number
  cycleBudgetMs?: number
}
export type EngineServiceOutcome
  = | { status: 'disabled' | 'stopped' }
    | { status: 'held', reason: HoldReason }
    | { status: 'configuration-error', reason: 'storage-unavailable' }
export const inspectEngineService = inspectAdmission
const configurationCodes = new Set([
  'invalid-request',
  'unsupported-capability',
  'duplicate-attempt',
  'workspace-failed',
  'receipt-failed'
])
const bounded = (value: number, min: number, max: number) =>
  Number.isSafeInteger(value) && value >= min && value <= max

function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, milliseconds)
    signal?.addEventListener('abort', done, { once: true })
    if (signal?.aborted) done()
  })
}

/** Serialize both engines through a durable gate and the unchanged one-shot transport. */
export async function runEngineService(
  configuration: EngineServiceConfiguration
): Promise<EngineServiceOutcome> {
  if (configuration.enabled !== 'true') return { status: 'disabled' }
  try {
    await validateStorage(configuration)
  } catch {
    return { status: 'configuration-error', reason: 'storage-unavailable' }
  }
  let admission: Awaited<ReturnType<typeof acquireAdmission>>
  try {
    admission = await acquireAdmission(configuration)
  } catch {
    return { status: 'held', reason: 'journal-unavailable' }
  }
  if (!admission) return { status: 'held', reason: 'admission-exists' }
  let cycle = 0
  const hold = async (reason: HoldReason): Promise<EngineServiceOutcome> => {
    try {
      await admission.update({ phase: 'held', cycle, reason })
    } catch {
      return { status: 'held', reason: 'journal-unavailable' }
    }
    return { status: 'held', reason }
  }
  const idleMin = configuration.idleMinMs ?? 1000
  const idleMax = configuration.idleMaxMs ?? 30000
  const shutdownGrace = configuration.shutdownGraceMs ?? 30000
  const cycleBudget = configuration.cycleBudgetMs ?? 180000
  let workers: ServiceWorkers
  try {
    workers
      = typeof configuration.workers === 'function'
        ? await configuration.workers()
        : configuration.workers
    if (
      !bounded(idleMin, 1000, 60000)
      || !bounded(idleMax, idleMin, 60000)
      || !bounded(shutdownGrace, 1000, 60000)
      || !bounded(cycleBudget, 1000, 180000)
      || workers.length !== 2
    )
      throw new Error()
    const engines = new Set<string>()
    for (const worker of workers) {
      createEngineHttp(worker)
      const capability = bannerEngineCapabilitySchema.parse(
        worker.adapter.capability
      )
      if (
        !['photocraft', 'vectorcraft'].includes(capability.engine.id)
        || !bounded(worker.pollIntervalMs ?? 1000, 1, 5000)
        || !bounded(worker.abortGraceMs ?? 5000, 1, 10000)
      )
        throw new Error()
      engines.add(capability.engine.id)
    }
    if (engines.size !== 2) throw new Error()
  } catch {
    return hold('configuration-invalid')
  }
  let idleDelay = idleMin
  try {
    while (!configuration.signal?.aborted) {
      await validateStorage(configuration)
      const worker = workers[cycle % 2]!
      cycle++
      const engine = worker.adapter.capability.engine.id as
        'photocraft' | 'vectorcraft'
      await admission.update({ phase: 'active', cycle, engine })
      // Persisted active state precedes even the claim request, whose ACK can be lost.
      const controller = new AbortController()
      let abortTimer: ReturnType<typeof setTimeout> | undefined
      let timeoutReason: HoldReason = 'cycle-unconfirmed'
      let timeout!: () => void
      const expired = new Promise<null>((resolve) => {
        timeout = () => resolve(null)
      })
      const abort = (reason: HoldReason) => {
        if (controller.signal.aborted) return
        timeoutReason = reason
        abortTimer = setTimeout(timeout, shutdownGrace)
        controller.abort()
      }
      const stop = () => abort('shutdown-unconfirmed')
      const budgetTimer = setTimeout(
        () => abort('cycle-unconfirmed'),
        cycleBudget
      )
      configuration.signal?.addEventListener('abort', stop, { once: true })
      if (configuration.signal?.aborted) stop()
      let outcome: EngineWorkerOutcome | null
      try {
        // A rejected or late-settling worker never triggers another call or releases the gate.
        outcome = await Promise.race([
          runEngineWorkerOnce({
            ...worker,
            stagingRoot: join(configuration.root, 'staging'),
            workspaceRoot: join(configuration.root, 'attempts'),
            signal: controller.signal
          }),
          expired
        ])
      } catch {
        return await hold('worker-threw')
      } finally {
        clearTimeout(budgetTimer)
        clearTimeout(abortTimer)
        configuration.signal?.removeEventListener('abort', stop)
      }
      if (outcome === null) return hold(timeoutReason)
      if (outcome.status === 'uncertain') return hold('worker-uncertain')
      if (
        outcome.status === 'failed'
        && (!outcome.code
          || configurationCodes.has(outcome.code)
          || outcome.code === 'transport-failed')
      )
        return hold('worker-configuration')
      await admission.update({
        phase: outcome.status === 'idle' ? 'idle' : 'settled',
        cycle,
        engine
      })
      // Even a busy queue gets a bounded delay. No tight empty-queue or failure loop.
      await pause(
        outcome.status === 'idle' ? idleDelay : idleMin,
        configuration.signal
      )
      idleDelay
        = outcome.status === 'idle' ? Math.min(idleMax, idleDelay * 2) : idleMin
    }
    await admission.release(cycle)
    return { status: 'stopped' }
  } catch {
    return hold('journal-unavailable')
  }
}
