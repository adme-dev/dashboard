import type { H3Event } from 'h3'
import { createError, getRequestURL, readBody } from 'h3'

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
  type GodModeTransactionOperation
} from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'
const ROUTE = new RegExp(`^/api/agency/measurement/clients/${UUID}/google-conversion-actions$`, 'i')
const operationKey = Symbol('googleConversionActionGodModeOperation')

interface ProvisionedAction {
  item: {
    resourceName: string
  }
}

function operationFor(event: H3Event): GodModeTransactionOperation {
  const context = event.context as Record<PropertyKey, unknown>
  const existing = context[operationKey] as GodModeTransactionOperation | undefined
  if (existing) return existing
  const operation = defineGodModeTransactionOperation({
    routeOrTool: `POST ${getRequestURL(event).pathname}`,
    mutationName: 'Google conversion action provisioning',
    missingResultMessage: 'Google conversion action provisioning did not produce a durable result',
    retryableInProgress: true
  })
  context[operationKey] = operation
  return operation
}

export function isGoogleConversionActionProvisionPath(path: string): boolean {
  return ROUTE.test(path)
}

async function prepare(event: H3Event) {
  return await prepareGodModeTransactionMutation(event, operationFor(event), {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

export async function executeGodModeGoogleConversionActionProvision<T extends ProvisionedAction>(
  event: H3Event,
  provision: () => Promise<T>
): Promise<T> {
  if (!getGodModeRouteAuditState(event)) return await provision()
  const operation = operationFor(event)
  const wrapped = await executeGodModeTransactionMutation(event, operation, transaction, async () => {
    const result = await provision()
    return { id: result.item.resourceName, result }
  }, async (_db, resultReference) => {
    const result = await provision()
    if (result.item.resourceName !== resultReference) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Google conversion action replay returned a different resource'
      })
    }
    return { id: resultReference, result }
  })
  return wrapped.result
}

export function registerGodModeGoogleConversionActionMutationFamily(): () => void {
  return registerGodModeMutationFamily({
    family: 'google-conversion-action-provision',
    method: 'POST',
    matchesPath: isGoogleConversionActionProvisionPath,
    prepare
  })
}
