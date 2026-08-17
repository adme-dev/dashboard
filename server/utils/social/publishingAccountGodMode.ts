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

const COMPLETE_ROUTE = '/api/agency/social/publishing/accounts/complete'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const DISCONNECT_ROUTE = new RegExp(`^/api/agency/social/publishing/accounts/${UUID}$`, 'i')
const disconnectOperationKey = Symbol('socialPublishingAccountDisconnectGodModeOperation')

const ACCOUNT_COMPLETE = defineGodModeTransactionOperation({
  routeOrTool: `POST ${COMPLETE_ROUTE}`,
  mutationName: 'social publishing account completion',
  missingResultMessage: 'Social publishing account completion did not produce a durable result',
  retryableInProgress: true
})

export function isSocialPublishingAccountCompletePath(path: string): boolean {
  return path === COMPLETE_ROUTE
}

export function isSocialPublishingAccountDisconnectPath(path: string): boolean {
  return DISCONNECT_ROUTE.test(path)
}

async function prepareAccountComplete(event: H3Event) {
  return await prepareGodModeTransactionMutation(event, ACCOUNT_COMPLETE, {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

function defineDisconnectOperation(path: string): GodModeTransactionOperation {
  return defineGodModeTransactionOperation({
    routeOrTool: `DELETE ${path}`,
    mutationName: 'social publishing account disconnection',
    missingResultMessage: 'Social publishing account disconnection did not produce a durable result',
    retryableInProgress: true
  })
}

async function prepareAccountDisconnect(event: H3Event) {
  const path = getRequestURL(event).pathname
  const operation = defineDisconnectOperation(path)
  ;(event.context as Record<PropertyKey, unknown>)[disconnectOperationKey] = operation
  return await prepareGodModeTransactionMutation(event, operation, {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async () => await digestMcpRequestBody({ path })
  })
}

export async function executeGodModeSocialPublishingAccountComplete<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  if (!event.context || !getGodModeRouteAuditState(event)) return await transaction(mutate)
  return await executeGodModeTransactionMutation(event, ACCOUNT_COMPLETE, transaction, mutate, replay)
}

export async function executeGodModeSocialPublishingAccountDisconnect<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  if (!event.context || !getGodModeRouteAuditState(event)) return await transaction(mutate)
  const operation = (event.context as Record<PropertyKey, unknown>)[disconnectOperationKey] as GodModeTransactionOperation | undefined
  if (!operation) throw new Error('Social publishing account disconnection coordination is unavailable')
  return await executeGodModeTransactionMutation(event, operation, transaction, mutate, replay)
}

export function registerGodModeSocialPublishingAccountMutationFamilies(): () => void {
  const unregisterComplete = registerGodModeMutationFamily({
    family: 'social-publishing-account-complete',
    method: 'POST',
    matchesPath: isSocialPublishingAccountCompletePath,
    prepare: prepareAccountComplete
  })
  const unregisterDisconnect = registerGodModeMutationFamily({
    family: 'social-publishing-account-disconnect',
    method: 'DELETE',
    matchesPath: isSocialPublishingAccountDisconnectPath,
    prepare: prepareAccountDisconnect
  })
  return () => {
    unregisterDisconnect()
    unregisterComplete()
  }
}
