import { createError, getRequestURL, readBody, type H3Event } from 'h3'
import { transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import { defineGodModeTransactionOperation, executeGodModeTransactionMutation, prepareGodModeTransactionMutation, type GodModeTransactionDb, type GodModeTransactionOperation } from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const key = Symbol('storyboardReferencesGodMode')
const route = /^\/api\/agency\/video\/projects\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/storyboard\/references$/i
export const isStoryboardReferenceWritePath = (path: string) => route.test(path)
function operation(event: H3Event) {
  const context = event.context as Record<PropertyKey, unknown>
  if (!context[key]) context[key] = defineGodModeTransactionOperation({
    routeOrTool: `PUT ${getRequestURL(event).pathname}`, mutationName: 'storyboard reference revision',
    missingResultMessage: 'Storyboard reference revision has no durable result', retryableInProgress: true
  })
  return context[key] as GodModeTransactionOperation
}
export function registerGodModeStoryboardMutationFamilies() {
  return registerGodModeMutationFamily({
    family: 'video-storyboard-references', method: 'PUT', matchesPath: isStoryboardReferenceWritePath,
    prepare: event => prepareGodModeTransactionMutation(event, operation(event), {
      transaction, appendAudit: appendGodModeAuditEvent,
      digestRequest: async request => digestMcpRequestBody(await readBody(request))
    })
  })
}

/** Canonical operation IDs protect staff too; owner replay reauthorizes in that core. */
export async function executeStoryboardReferenceWrite<T extends { id: string }>(event: H3Event, mutate: (db: GodModeTransactionDb) => Promise<T>): Promise<T> {
  const prepared = (event.context as Record<PropertyKey, unknown>)[key] as GodModeTransactionOperation | undefined
  if (!prepared) return transaction(mutate)
  return executeGodModeTransactionMutation(event, prepared, transaction, mutate, async (db, receiptId) => {
    const result = await mutate(db)
    if (result.id !== receiptId) throw createError({ statusCode: 409, statusMessage: 'Storyboard receipt mismatch' })
    return result
  })
}
