import type { H3Event } from 'h3'
import { createError, getRequestURL, readBody } from 'h3'

import { transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import {
  defineGodModeTransactionOperation,
  executeGodModeTransactionMutation,
  prepareGodModeTransactionMutation,
  type GodModeTransactionDb,
  type GodModeTransactionOperation
} from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'
const DOCUMENT_ROUTE = new RegExp(`^/api/agency/page-studio/sites/${UUID}/document$`, 'i')
const operationKey = Symbol('pageStudioDocumentSaveOperation')

function operationFor(event: H3Event): GodModeTransactionOperation {
  const context = event.context as Record<PropertyKey, unknown>
  const existing = context[operationKey] as GodModeTransactionOperation | undefined
  if (existing) return existing
  const operation = defineGodModeTransactionOperation({
    routeOrTool: `PUT ${getRequestURL(event).pathname}`,
    mutationName: 'Page Studio document save',
    missingResultMessage: 'God mode Page Studio document save did not produce a durable result',
    retryableInProgress: true
  })
  context[operationKey] = operation
  return operation
}

export async function executePageStudioDocumentSave<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  const operation = (event.context as Record<PropertyKey, unknown>)[operationKey] as GodModeTransactionOperation | undefined
  if (!operation) return await transaction(mutate)
  if (!DOCUMENT_ROUTE.test(getRequestURL(event).pathname)) {
    throw createError({ statusCode: 503, statusMessage: 'God mode Page Studio coordination unavailable' })
  }
  return await executeGodModeTransactionMutation(event, operation, transaction, mutate, replay)
}

export function registerGodModePageStudioMutationFamilies(): () => void {
  return registerGodModeMutationFamily({
    family: 'page-studio-document-save',
    method: 'PUT',
    matchesPath: path => DOCUMENT_ROUTE.test(path),
    prepare: async event => await prepareGodModeTransactionMutation(event, operationFor(event), {
      transaction,
      appendAudit: appendGodModeAuditEvent,
      digestRequest: async request => await digestMcpRequestBody(await readBody(request))
    })
  })
}
