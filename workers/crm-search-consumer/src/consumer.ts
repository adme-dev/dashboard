import { z } from 'zod'

import {
  CRM_SEARCH_DEAD_LETTER_PATH,
  CRM_SEARCH_PROCESS_PATH,
  canonicalCrmSearchIndexQueueMessage,
  parseCrmSearchIndexQueueMessage,
  type CrmSearchIndexQueueMessage,
  type CrmSearchServicePath
} from '../../../shared/crmSearchIndexProtocol'
import { createCrmSearchSignedServiceRequest } from '../../../shared/crmSearchIndexSigning'
import {
  CRM_SEARCH_DEAD_LETTER_QUEUE_NAME,
  CRM_SEARCH_PRIMARY_QUEUE_NAME,
  evaluateCrmSearchConsumerHealth,
  prepareCrmSearchConsumerRuntime,
  type CrmSearchConsumerBindings,
  type CrmSearchConsumerHealthDependencies
} from './health'

export {
  CRM_SEARCH_DEAD_LETTER_QUEUE_NAME,
  CRM_SEARCH_PRIMARY_QUEUE_NAME,
  type CrmSearchConsumerBindings
} from './health'

export const CRM_SEARCH_RETRY_DELAY_SECONDS = 30 as const

const OUTCOME_RESPONSE_MAX_BYTES = 128
const OUTCOME_REQUEST_TIMEOUT_MS = 10_000

const processOutcomeSchema = z.object({
  status: z.enum(['complete', 'accepted_provider_pending', 'superseded'])
}).strict()
const deadLetterOutcomeSchema = z.object({
  status: z.enum(['recorded', 'duplicate'])
}).strict()

export interface CrmSearchQueueMessage {
  id: string
  body: unknown
  timestamp: Date
  attempts: number
  ack(): void
  retry(options?: { delaySeconds?: number }): void
}

export interface CrmSearchQueueBatch {
  queue: string
  messages: readonly CrmSearchQueueMessage[]
}

type CrmSearchConsumerLogStatus
  = | 'health_unready'
    | 'unknown_queue'
    | 'malformed_envelope'
    | 'forward_failed'
    | 'complete'
    | 'accepted_provider_pending'
    | 'superseded'
    | 'recorded'
    | 'duplicate'

export interface CrmSearchConsumerLogRecord {
  event: 'crm_search_consumer'
  status: CrmSearchConsumerLogStatus
  operationId?: string
  correlationId?: string
  protocolVersion?: number
}

export interface CrmSearchConsumerDependencies
  extends CrmSearchConsumerHealthDependencies {
  log(record: CrmSearchConsumerLogRecord): void
}

const defaultDependencies: CrmSearchConsumerDependencies = {
  fetch: async request => await fetch(request),
  now: () => Date.now(),
  log: record => console.log(JSON.stringify(record))
}

function retry(message: CrmSearchQueueMessage): void {
  message.retry({ delaySeconds: CRM_SEARCH_RETRY_DELAY_SECONDS })
}

function safeLog(
  dependencies: CrmSearchConsumerDependencies,
  record: CrmSearchConsumerLogRecord
): void {
  try {
    dependencies.log(record)
  } catch {
    // Queue disposition must never depend on the observability backend.
  }
}

function parseMessage(body: unknown, nowMs: number): CrmSearchIndexQueueMessage | null {
  if (typeof body === 'string') {
    return parseCrmSearchIndexQueueMessage(body, { nowMs })
  }
  try {
    const canonical = canonicalCrmSearchIndexQueueMessage(
      body as CrmSearchIndexQueueMessage,
      { nowMs }
    )
    return parseCrmSearchIndexQueueMessage(canonical, { nowMs })
  } catch {
    return null
  }
}

function logForMessage(
  dependencies: CrmSearchConsumerDependencies,
  message: CrmSearchIndexQueueMessage,
  status: CrmSearchConsumerLogStatus
): void {
  safeLog(dependencies, {
    event: 'crm_search_consumer',
    operationId: message.operationId,
    correlationId: message.correlationId,
    protocolVersion: message.protocolVersion,
    status
  })
}

async function readBoundedOutcome(response: Response): Promise<unknown> {
  if (response.status !== 200) throw new Error('crm_search_forward_failed')
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim()
  if (contentType !== 'application/json') throw new Error('crm_search_forward_failed')
  const declaredLength = response.headers.get('content-length')
  if (
    declaredLength
    && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > OUTCOME_RESPONSE_MAX_BYTES)
  ) throw new Error('crm_search_forward_failed')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > OUTCOME_RESPONSE_MAX_BYTES) {
    throw new Error('crm_search_forward_failed')
  }
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('crm_search_forward_failed')
  }
}

async function forwardMessage(
  message: CrmSearchIndexQueueMessage,
  path: CrmSearchServicePath,
  bindings: CrmSearchConsumerBindings,
  dependencies: CrmSearchConsumerDependencies,
  nowMs: number
): Promise<CrmSearchConsumerLogStatus> {
  const runtime = prepareCrmSearchConsumerRuntime(bindings, nowMs)
  const signed = await createCrmSearchSignedServiceRequest(
    message,
    path,
    runtime.keyring,
    { nowMs }
  )
  const response = await dependencies.fetch(new Request(`${runtime.origin}${path}`, {
    method: 'POST',
    headers: signed.headers,
    body: signed.body,
    redirect: 'error',
    signal: AbortSignal.timeout(OUTCOME_REQUEST_TIMEOUT_MS)
  }))
  const outcome = await readBoundedOutcome(response)

  if (path === CRM_SEARCH_PROCESS_PATH) {
    const parsed = processOutcomeSchema.safeParse(outcome)
    if (!parsed.success) throw new Error('crm_search_forward_failed')
    return parsed.data.status
  }
  const parsed = deadLetterOutcomeSchema.safeParse(outcome)
  if (!parsed.success) throw new Error('crm_search_forward_failed')
  return parsed.data.status
}

async function processMessage(
  queueMessage: CrmSearchQueueMessage,
  path: CrmSearchServicePath,
  bindings: CrmSearchConsumerBindings,
  dependencies: CrmSearchConsumerDependencies
): Promise<void> {
  const nowMs = dependencies.now()
  const message = parseMessage(queueMessage.body, nowMs)
  if (!message) {
    safeLog(dependencies, { event: 'crm_search_consumer', status: 'malformed_envelope' })
    retry(queueMessage)
    return
  }

  try {
    const status = await forwardMessage(message, path, bindings, dependencies, nowMs)
    queueMessage.ack()
    logForMessage(dependencies, message, status)
  } catch {
    retry(queueMessage)
    logForMessage(dependencies, message, 'forward_failed')
  }
}

export async function consumeCrmSearchQueueBatch(
  batch: CrmSearchQueueBatch,
  bindings: CrmSearchConsumerBindings,
  dependencies: CrmSearchConsumerDependencies = defaultDependencies
): Promise<void> {
  const path = batch.queue === CRM_SEARCH_PRIMARY_QUEUE_NAME
    ? CRM_SEARCH_PROCESS_PATH
    : batch.queue === CRM_SEARCH_DEAD_LETTER_QUEUE_NAME
      ? CRM_SEARCH_DEAD_LETTER_PATH
      : null

  if (!path) {
    safeLog(dependencies, { event: 'crm_search_consumer', status: 'unknown_queue' })
    for (const message of batch.messages) retry(message)
    return
  }

  try {
    await evaluateCrmSearchConsumerHealth(bindings, dependencies)
  } catch {
    safeLog(dependencies, { event: 'crm_search_consumer', status: 'health_unready' })
    for (const message of batch.messages) retry(message)
    return
  }

  for (const message of batch.messages) {
    await processMessage(message, path, bindings, dependencies)
  }
}
