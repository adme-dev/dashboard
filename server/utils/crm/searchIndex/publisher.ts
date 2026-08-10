import type { H3Event } from 'h3'

import {
  CRM_SEARCH_INDEX_PROTOCOL_VERSION,
  canonicalCrmSearchIndexQueueMessage,
  type CrmSearchIndexQueueMessage
} from '~~/shared/crmSearchIndexProtocol'
import {
  resolveCrmSearchConfirmationKeyring,
  resolveCrmSearchIndexQueueProducer,
  type CrmSearchIndexQueueProducer
} from '~~/server/utils/crm/searchIndex/bindings'
import {
  CRM_SEARCH_DIRTY_EXPANSION_MAX_SCHEMAS,
  expandCrmSearchDirtySourceBatch
} from '~~/server/utils/crm/searchIndex/dirtyExpansionRepository'
import {
  claimCrmSearchOperationsForPublication,
  confirmCrmSearchOperationPublished,
  rescheduleCrmSearchOperationPublication
} from '~~/server/utils/crm/searchIndex/publicationRepository'
import {
  crmSearchRepositoryDependencies
} from '~~/server/utils/crm/searchIndex/repository'

export const CRM_SEARCH_PUBLISH_DEFAULT_LIMIT = 25 as const
export const CRM_SEARCH_PUBLISH_MAX_LIMIT = 100 as const
export const CRM_SEARCH_PUBLICATION_LEASE_SECONDS = 60 as const
export const CRM_SEARCH_DIRTY_EXPANSION_LEASE_SECONDS = 60 as const
export const CRM_SEARCH_PUBLICATION_RETRY_SECONDS = 30 as const
export const CRM_SEARCH_EXPANSION_RESULT_MAX_OPERATIONS
  = CRM_SEARCH_PUBLISH_MAX_LIMIT * CRM_SEARCH_DIRTY_EXPANSION_MAX_SCHEMAS

export interface CrmSearchDirtyExpansionResult {
  dirtyClaimed: number
  operationsCreated: number
  skippedByControl: number
}

export interface CrmSearchOperationPublicationClaim {
  operationId: string
  claimToken: string
  claimGeneration: number
}

export interface CrmSearchIndexPublishResult extends CrmSearchDirtyExpansionResult {
  operationsPublished: number
  operationsRescheduled: number
}

/**
 * `expandDirtySourceBatch` owns one transaction that claims dirty sources with
 * SKIP LOCKED, locks fresh control/policy or teardown authority, upserts the
 * replaceable pre-admission intent, and completes/releases the source claim.
 * The three publication methods own a distinct transport lease; they must not
 * reuse processor claims or processing-attempt counters.
 */
export interface CrmSearchIndexPublisherDependencies {
  now(): number
  randomUUID(): string
  expandDirtySourceBatch(input: {
    limit: number
    now: Date
    event: H3Event
  }): Promise<CrmSearchDirtyExpansionResult>
  claimOperationsForPublication(input: {
    limit: number
    leaseSeconds: number
    now: Date
  }): Promise<readonly CrmSearchOperationPublicationClaim[]>
  confirmOperationPublished(input: {
    operationId: string
    claimToken: string
    claimGeneration: number
    publishedAt: Date
  }): Promise<boolean>
  rescheduleOperationPublication(input: {
    operationId: string
    claimToken: string
    claimGeneration: number
    errorClass: 'queue_unavailable' | 'queue_send_failed' | 'invalid_publication_claim'
    nextAttemptAt: Date
  }): Promise<boolean>
  resolveQueue(event: H3Event): CrmSearchIndexQueueProducer | null
}

const defaultDependencies: CrmSearchIndexPublisherDependencies = {
  now: Date.now,
  randomUUID: () => globalThis.crypto.randomUUID(),
  async expandDirtySourceBatch(input) {
    return await expandCrmSearchDirtySourceBatch({
      limit: input.limit,
      leaseSeconds: CRM_SEARCH_DIRTY_EXPANSION_LEASE_SECONDS,
      now: input.now.toISOString(),
      confirmationKeyring: resolveCrmSearchConfirmationKeyring(input.event)
    })
  },
  async claimOperationsForPublication(input) {
    return await claimCrmSearchOperationsForPublication({
      ...input,
      now: input.now.toISOString()
    })
  },
  async confirmOperationPublished(input) {
    return await crmSearchRepositoryDependencies.transactionWithoutRetry(
      async transaction => await confirmCrmSearchOperationPublished({
        ...input,
        publishedAt: input.publishedAt.toISOString()
      }, transaction)
    )
  },
  async rescheduleOperationPublication(input) {
    return await crmSearchRepositoryDependencies.transactionWithoutRetry(
      async transaction => await rescheduleCrmSearchOperationPublication({
        ...input,
        nextAttemptAt: input.nextAttemptAt.toISOString()
      }, transaction)
    )
  },
  resolveQueue: resolveCrmSearchIndexQueueProducer
}

function requireLimit(limit: number): number {
  if (
    !Number.isSafeInteger(limit)
    || limit < 1
    || limit > CRM_SEARCH_PUBLISH_MAX_LIMIT
  ) throw new RangeError('CRM search publisher limit is invalid')
  return limit
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function ownInteger(
  value: Record<string, unknown>,
  key: string,
  maximum: number
): number | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !('value' in descriptor)) return null
  const number = descriptor.value
  return Number.isSafeInteger(number) && number >= 0 && number <= maximum
    ? number
    : null
}

function projectExpansionResult(
  value: unknown,
  limit: number
): CrmSearchDirtyExpansionResult {
  if (!isPlainRecord(value) || Object.keys(value).length !== 3) {
    throw new TypeError('CRM search expansion result is invalid')
  }
  const dirtyClaimed = ownInteger(value, 'dirtyClaimed', limit)
  const operationsCreated = ownInteger(
    value,
    'operationsCreated',
    limit * CRM_SEARCH_DIRTY_EXPANSION_MAX_SCHEMAS
  )
  const skippedByControl = ownInteger(value, 'skippedByControl', limit)
  if (
    dirtyClaimed === null
    || operationsCreated === null
    || skippedByControl === null
    || skippedByControl > dirtyClaimed
  ) throw new TypeError('CRM search expansion result is invalid')
  return { dirtyClaimed, operationsCreated, skippedByControl }
}

function projectPublicationClaim(value: unknown): CrmSearchOperationPublicationClaim | null {
  if (!isPlainRecord(value) || Object.keys(value).length !== 3) return null
  const operation = Object.getOwnPropertyDescriptor(value, 'operationId')
  const token = Object.getOwnPropertyDescriptor(value, 'claimToken')
  const generation = Object.getOwnPropertyDescriptor(value, 'claimGeneration')
  if (
    !operation || !('value' in operation) || typeof operation.value !== 'string'
    || !token || !('value' in token) || typeof token.value !== 'string'
    || !generation || !('value' in generation)
    || !Number.isSafeInteger(generation.value) || generation.value < 1
  ) return null
  return {
    operationId: operation.value,
    claimToken: token.value,
    claimGeneration: generation.value
  }
}

function requireNow(dependencies: CrmSearchIndexPublisherDependencies): number {
  const nowMs = dependencies.now()
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new TypeError('CRM search publisher clock is invalid')
  }
  return nowMs
}

export async function expandCrmSearchDirtySources(
  _event: H3Event,
  options: { limit: number },
  dependencies: CrmSearchIndexPublisherDependencies = defaultDependencies
): Promise<CrmSearchDirtyExpansionResult> {
  const limit = requireLimit(options.limit)
  const nowMs = requireNow(dependencies)
  const result = await dependencies.expandDirtySourceBatch({
    limit,
    now: new Date(nowMs),
    event: _event
  })
  return projectExpansionResult(result, limit)
}

async function reschedule(
  claim: CrmSearchOperationPublicationClaim,
  errorClass: 'queue_unavailable' | 'queue_send_failed' | 'invalid_publication_claim',
  nowMs: number,
  dependencies: CrmSearchIndexPublisherDependencies
): Promise<boolean> {
  return await dependencies.rescheduleOperationPublication({
    operationId: claim.operationId,
    claimToken: claim.claimToken,
    claimGeneration: claim.claimGeneration,
    errorClass,
    nextAttemptAt: new Date(nowMs + CRM_SEARCH_PUBLICATION_RETRY_SECONDS * 1000)
  })
}

export async function publishCrmSearchOperations(
  event: H3Event,
  options: { limit: number },
  dependencies: CrmSearchIndexPublisherDependencies = defaultDependencies
): Promise<CrmSearchIndexPublishResult> {
  const limit = requireLimit(options.limit)
  const nowMs = requireNow(dependencies)
  const expansion = projectExpansionResult(
    await dependencies.expandDirtySourceBatch({ limit, now: new Date(nowMs), event }),
    limit
  )
  const claimed = await dependencies.claimOperationsForPublication({
    limit,
    leaseSeconds: CRM_SEARCH_PUBLICATION_LEASE_SECONDS,
    now: new Date(nowMs)
  })
  if (!Array.isArray(claimed) || claimed.length > limit) {
    throw new TypeError('CRM search publication claims are invalid')
  }

  const queue = dependencies.resolveQueue(event)
  let operationsPublished = 0
  let operationsRescheduled = 0

  for (const candidate of claimed) {
    const claim = projectPublicationClaim(candidate)
    if (!claim) throw new TypeError('CRM search publication claim is invalid')
    if (!queue) {
      if (await reschedule(claim, 'queue_unavailable', nowMs, dependencies)) {
        operationsRescheduled += 1
      }
      continue
    }

    const message: CrmSearchIndexQueueMessage = {
      protocolVersion: CRM_SEARCH_INDEX_PROTOCOL_VERSION,
      operationId: claim.operationId,
      correlationId: dependencies.randomUUID(),
      enqueuedAt: new Date(nowMs).toISOString()
    }
    try {
      // Validate the exact protocol object before crossing the Queue binding.
      canonicalCrmSearchIndexQueueMessage(message, { nowMs })
    } catch {
      if (await reschedule(claim, 'invalid_publication_claim', nowMs, dependencies)) {
        operationsRescheduled += 1
      }
      continue
    }

    try {
      await queue.send(message, { contentType: 'json' })
    } catch {
      if (await reschedule(claim, 'queue_send_failed', nowMs, dependencies)) {
        operationsRescheduled += 1
      }
      continue
    }

    if (await dependencies.confirmOperationPublished({
      operationId: claim.operationId,
      claimToken: claim.claimToken,
      claimGeneration: claim.claimGeneration,
      publishedAt: new Date(nowMs)
    })) operationsPublished += 1
  }

  return {
    dirtyClaimed: expansion.dirtyClaimed,
    operationsCreated: expansion.operationsCreated,
    operationsPublished,
    operationsRescheduled,
    skippedByControl: expansion.skippedByControl
  }
}
