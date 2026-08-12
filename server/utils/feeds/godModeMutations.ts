import type { H3Event } from 'h3'
import { getRequestURL, readBody } from 'h3'

import { transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import {
  getGodModeRouteAuditState,
  registerGodModeMutationFamily
} from '~~/server/utils/godMode/featureGate'
import {
  defineGodModeTransactionOperation,
  executeGodModeTransactionMutation,
  prepareGodModeTransactionMutation,
  type GodModeTransactionDb,
  type GodModeTransactionOperation
} from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const DEALER_LINK_ROUTE = '/api/admin/dealer-feed-links'
const CLIENT_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const FEED_CREATE_ROUTE = new RegExp(`^/api/admin/dealer-feeds/${CLIENT_ID}$`, 'i')
const FEED_PREVIEW_ROUTE = new RegExp(`^/api/admin/dealer-feeds/${CLIENT_ID}/preview$`, 'i')
const feedCreateOperationKey = Symbol('dealerFeedCreateGodModeOperation')

const DEALER_LINK_UPSERT = defineGodModeTransactionOperation({
  routeOrTool: `POST ${DEALER_LINK_ROUTE}`,
  mutationName: 'dealer feed link upsert',
  missingResultMessage: 'Dealer feed link upsert did not produce a durable result',
  retryableInProgress: true
})

export interface DealerFeedReference {
  providerId: string
  feedId: string
  platform: 'google' | 'facebook'
}

export function isDealerFeedCreatePath(path: string): boolean {
  return FEED_CREATE_ROUTE.test(path)
}

export function isDealerFeedPreviewPath(path: string): boolean {
  return FEED_PREVIEW_ROUTE.test(path)
}

async function prepareDealerFeedLinkUpsert(event: H3Event) {
  return await prepareGodModeTransactionMutation(event, DEALER_LINK_UPSERT, {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

function defineFeedCreateOperation(path: string): GodModeTransactionOperation {
  return defineGodModeTransactionOperation({
    routeOrTool: `POST ${path}`,
    mutationName: 'dealer feed creation',
    missingResultMessage: 'Dealer feed creation did not produce a durable provider reference',
    retryableInProgress: true
  })
}

async function prepareDealerFeedCreation(event: H3Event) {
  const path = getRequestURL(event).pathname
  const operation = defineFeedCreateOperation(path)
  ;(event.context as Record<PropertyKey, unknown>)[feedCreateOperationKey] = operation
  return await prepareGodModeTransactionMutation(event, operation, {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

async function prepareDealerFeedPreview() {
  return {
    strategy: 'task5-execution-ledger' as const,
    prepared: true as const,
    persistTerminal: async (terminal: Parameters<typeof appendGodModeAuditEvent>[0]) => {
      await appendGodModeAuditEvent(terminal)
    }
  }
}

export async function executeGodModeDealerFeedLinkUpsert<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  if (!getGodModeRouteAuditState(event)) return await transaction(mutate)
  return await executeGodModeTransactionMutation(event, DEALER_LINK_UPSERT, transaction, mutate, replay)
}

export async function executeGodModeDealerFeedCreation(
  event: H3Event,
  create: () => Promise<DealerFeedReference>,
  replay: (feedId: string) => Promise<DealerFeedReference>
): Promise<DealerFeedReference> {
  if (!getGodModeRouteAuditState(event)) return await create()
  const operation = (event.context as Record<PropertyKey, unknown>)[feedCreateOperationKey] as GodModeTransactionOperation | undefined
  if (!operation) throw new Error('Dealer feed creation coordination is unavailable')

  const result = await executeGodModeTransactionMutation(
    event,
    operation,
    transaction,
    async () => {
      const feed = await create()
      return { id: feed.feedId, feed }
    },
    async (_db, feedId) => ({ id: feedId, feed: await replay(feedId) })
  )
  return result.feed
}

export function registerGodModeDealerFeedMutationFamilies(): Array<() => void> {
  return [
    registerGodModeMutationFamily({
      family: 'dealer-feed-link-upsert',
      method: 'POST',
      matchesPath: path => path === DEALER_LINK_ROUTE,
      prepare: prepareDealerFeedLinkUpsert
    }),
    registerGodModeMutationFamily({
      family: 'dealer-feed-create',
      method: 'POST',
      matchesPath: isDealerFeedCreatePath,
      prepare: prepareDealerFeedCreation
    }),
    registerGodModeMutationFamily({
      family: 'dealer-feed-preview',
      method: 'POST',
      matchesPath: isDealerFeedPreviewPath,
      prepare: prepareDealerFeedPreview
    })
  ]
}
