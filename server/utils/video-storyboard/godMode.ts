import { createError, getRequestURL, readBody, type H3Event } from 'h3'
import { transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import { defineGodModeTransactionOperation, executeGodModeTransactionMutation, prepareGodModeTransactionMutation, type GodModeTransactionDb, type GodModeTransactionOperation } from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const key = Symbol('storyboardReferencesGodMode')
const route = /^\/api\/agency\/video\/projects\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/storyboard\/references$/i
export const isStoryboardReferenceWritePath = (path: string) => route.test(path)
export const isStoryboardApplyWritePath = (path: string) => route.test(path.replace(/\/apply$/, '/references')) && path.endsWith('/apply')
export const isStoryboardRevisionWritePath = (path: string) => route.test(path.replace(/\/revisions$/, '/references')) && path.endsWith('/revisions')
function operation(event: H3Event) {
  const context = event.context as Record<PropertyKey, unknown>
  if (!context[key]) context[key] = defineGodModeTransactionOperation({
    routeOrTool: `${(isStoryboardRevisionWritePath(getRequestURL(event).pathname) || isStoryboardApplyWritePath(getRequestURL(event).pathname)) ? 'POST' : 'PUT'} ${getRequestURL(event).pathname}`, mutationName: 'storyboard revision',
    missingResultMessage: 'Storyboard reference revision has no durable result', retryableInProgress: true
  })
  return context[key] as GodModeTransactionOperation
}
export function registerGodModeStoryboardMutationFamilies() {
  const prepare = (event: H3Event) => prepareGodModeTransactionMutation(event, operation(event), {
    transaction, appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => digestMcpRequestBody(await readBody(request))
  })
  const references = registerGodModeMutationFamily({ family: 'video-storyboard-references', method: 'PUT', matchesPath: isStoryboardReferenceWritePath, prepare })
  const revisions = registerGodModeMutationFamily({ family: 'video-storyboard-revisions', method: 'POST', matchesPath: isStoryboardRevisionWritePath, prepare })
  const applications = registerGodModeMutationFamily({ family: 'video-storyboard-apply', method: 'POST', matchesPath: isStoryboardApplyWritePath, prepare })
  return () => {
    applications()
    revisions()
    references()
  }
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
