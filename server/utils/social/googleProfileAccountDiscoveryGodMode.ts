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

const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'
const ROUTE = new RegExp(`^/api/agency/social/google/profiles/${UUID}/discover-account$`, 'i')
const operationKey = Symbol('googleProfileAccountDiscoveryGodModeOperation')

function operationFor(event: H3Event): GodModeTransactionOperation {
  const context = event.context as Record<PropertyKey, unknown>
  const existing = context[operationKey] as GodModeTransactionOperation | undefined
  if (existing) return existing
  const operation = defineGodModeTransactionOperation({
    routeOrTool: `POST ${getRequestURL(event).pathname}`,
    mutationName: 'Google profile account discovery',
    missingResultMessage: 'Google profile account discovery did not produce a durable result',
    retryableInProgress: true
  })
  context[operationKey] = operation
  return operation
}

export function isGoogleProfileAccountDiscoveryPath(path: string): boolean {
  return ROUTE.test(path)
}

async function prepare(event: H3Event) {
  return await prepareGodModeTransactionMutation(event, operationFor(event), {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

export async function executeGodModeGoogleProfileAccountDiscovery<T extends { connectionId: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  if (!getGodModeRouteAuditState(event)) return await transaction(mutate)
  const wrapped = await executeGodModeTransactionMutation(
    event,
    operationFor(event),
    transaction,
    async (db) => {
      const result = await mutate(db)
      return { id: result.connectionId, result }
    },
    async (db, resultReference) => ({
      id: resultReference,
      result: await replay(db, resultReference)
    })
  )
  return wrapped.result
}

export function registerGodModeGoogleProfileAccountDiscoveryMutationFamily(): () => void {
  return registerGodModeMutationFamily({
    family: 'google-profile-account-discovery',
    method: 'POST',
    matchesPath: isGoogleProfileAccountDiscoveryPath,
    prepare
  })
}
