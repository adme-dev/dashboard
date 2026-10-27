import { createError, getRequestURL, type H3Event } from 'h3'
import { getQueue, type QueueJob } from '~~/server/utils/queue'
import { startJobExecution, finishJobExecution } from '~~/server/utils/jobExecutionLedger'
import { acknowledgeDissectionDispatch, failDissectionDispatch, isDissectionDispatchAuthorized, reserveDissectionDispatch, type DissectionRecord } from '~~/server/utils/banner/dissectionJobs'
import { execute } from '~~/server/utils/db'
import { runDissectionPipeline } from '~~/server/utils/bannerDissectorPipeline'

const DISPATCH_FAILED = 'Dissection dispatch was not confirmed. Refresh the saved job before explicitly retrying.'
const EXECUTOR_UNAVAILABLE = 'Background execution is unavailable. Restore the queue or request lifetime support before explicitly retrying.'
const EXECUTION_FAILED = 'Dissection execution failed. Refresh the saved job before explicitly retrying.'
const STATE_UNCONFIRMED = 'Dissection dispatch state could not be confirmed. Refresh the saved job; do not automatically resubmit.'

type Lifetime = { waitUntil?: (task: Promise<unknown>) => void }

function requestLifetime(event: H3Event): ((task: Promise<unknown>) => void) | null {
  // Direct execution is a local development convenience, never hosted recovery.
  if (!['development', 'test'].includes(process.env.NODE_ENV || '')) return null
  try {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(getRequestURL(event).hostname)) return null
  } catch { return null }
  // Nitro installs event.waitUntil and forwards it to context.waitUntil on Pages.
  // The installed Pages adapter calls its platform holder `cloudflare.context`.
  const context = event.context as Lifetime & { cloudflare?: { context?: Lifetime, ctx?: Lifetime } }
  for (const holder of [event, context, context?.cloudflare?.context, context?.cloudflare?.ctx]) {
    if (typeof holder?.waitUntil === 'function') return holder.waitUntil.bind(holder)
  }
  return null
}

async function persistFailure(jobId: string, attemptId: string, message: string, leaseToken?: string) {
  try {
    await failDissectionDispatch(jobId, attemptId, message, leaseToken)
  } catch {
    throw createError({ statusCode: 503, statusMessage: STATE_UNCONFIRMED })
  }
}

/** Ledger is observability, never authority to repeat inference or regress a completed job. */
async function runRegistered(event: H3Event, job: QueueJob, jobId: string, attemptId: string) {
  const startedAt = Date.now()
  let execution: Awaited<ReturnType<typeof startJobExecution>>
  try {
    execution = await startJobExecution(job, { queueAttempt: 1, maxAttempts: 1, retryDelaySeconds: 0, dispatchMode: 'inline' })
  } catch {
    await persistFailure(jobId, attemptId, EXECUTION_FAILED, job.jobId)
    return
  }
  let failed: boolean
  try {
    const result = await runDissectionPipeline(event, jobId, { attemptId })
    failed = result.status === 'failed'
  } catch {
    failed = true
    // The pipeline owns active-attempt failure. This only covers failure before claim.
    await persistFailure(jobId, attemptId, EXECUTION_FAILED, job.jobId)
  }
  try {
    if (failed) await finishJobExecution(execution, 'failed', startedAt, new Error(EXECUTION_FAILED), true)
    else await finishJobExecution(execution, 'succeeded', startedAt)
  } catch {
    console.warn('[Dissector] Execution ledger completion unavailable')
  }
}

/** Producer insertion must never reset a transport ledger already running or complete. */
async function recordTransport(job: QueueJob, mode: 'queue' | 'inline') {
  await execute(
    `INSERT INTO platform_jobs (id, job_type, status, dispatch_mode, replayable, replay_context, enqueued_at)
     VALUES ($1, $2, 'queued', $3, FALSE, '{}'::jsonb, $4::timestamptz)
     ON CONFLICT (id) DO NOTHING`,
    [job.jobId, job.type, mode, job.enqueuedAt]
  )
}

function transportJob(row: DissectionRecord): QueueJob {
  const execution = row.manifest?.execution
  const dispatch = execution?.dispatch
  if (!execution?.attemptId || dispatch?.version !== 1 || !dispatch.leaseToken || !dispatch.lastSentAt) {
    throw createError({ statusCode: 503, statusMessage: STATE_UNCONFIRMED })
  }
  // Every transport lease has its own ledger row; the provider generation stays fixed.
  return { jobId: dispatch.leaseToken, type: 'dissect.analyze',
    payload: { jobId: row.job_id, attemptId: execution.attemptId }, enqueuedAt: dispatch.lastSentAt }
}

/** Queue-only delivery of an already leased row. An ambiguous send never fails its generation. */
export async function sendDissectionDispatch(event: H3Event, row: DissectionRecord): Promise<'acknowledged' | 'uncertain'> {
  const queue = getQueue(event)
  if (!queue) throw createError({ statusCode: 503, statusMessage: EXECUTOR_UNAVAILABLE })
  const job = transportJob(row)
  if (!await isDissectionDispatchAuthorized(row.job_id, row.manifest!.execution!.attemptId, job.jobId!)) return 'uncertain'
  let accepted = false
  try {
    await recordTransport(job, 'queue')
    if (!await isDissectionDispatchAuthorized(row.job_id, row.manifest!.execution!.attemptId, job.jobId!)) return 'uncertain'
    await queue.send(job, { contentType: 'json' })
    accepted = true
  } catch { /* Reservation remains recoverable even if acceptance was ambiguous. */ }
  try {
    await acknowledgeDissectionDispatch(row.job_id, row.manifest!.execution!.attemptId, job.jobId!, accepted)
  } catch {
    // Lost DB acknowledgement leaves either settled backoff or the bounded original lease.
    return 'uncertain'
  }
  return accepted ? 'acknowledged' : 'uncertain'
}

/** Initial admission shares the recovery lease. Only loopback development has a lifetime fallback. */
export async function dispatchDissection(event: H3Event, jobId: string, attemptId: string): Promise<void> {
  let row: DissectionRecord | null
  try {
    row = await reserveDissectionDispatch(jobId, attemptId)
    if (!row) return
  } catch {
    // A committed lease whose acknowledgement was lost is recoverable after expiry.
    throw createError({ statusCode: 503, statusMessage: STATE_UNCONFIRMED })
  }
  if (getQueue(event)) {
    await sendDissectionDispatch(event, row)
    return
  }
  const job = transportJob(row)
  const waitUntil = requestLifetime(event)
  if (!waitUntil) {
    await persistFailure(jobId, attemptId, EXECUTOR_UNAVAILABLE, job.jobId)
    return
  }
  try {
    await recordTransport(job, 'inline')
  } catch {
    await persistFailure(jobId, attemptId, DISPATCH_FAILED, job.jobId)
    return
  }
  // A deferred gate ensures a throwing registration cannot accidentally start work.
  let release!: (registered: boolean) => void
  const gate = new Promise<boolean>((resolve) => {
    release = resolve
  })
  const task = gate.then(registered => registered ? runRegistered(event, job, jobId, attemptId) : undefined).catch(() => {
    console.warn('[Dissector] Background execution state unavailable; refresh saved job')
  })
  try {
    waitUntil(task)
  } catch {
    release(false)
    await persistFailure(jobId, attemptId, DISPATCH_FAILED, job.jobId)
    return
  }
  release(true)
}
