import { createError } from 'h3'
import { customerDestinationGuard, readCustomerActivation } from './customerActivation'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { CustomerManagedTransferSchema, CustomerManagedTransferRecoverySchema, type CustomerManagedTransfer } from '~~/shared/pageStudio/customerManagedTransfer'
import { CompletedManagedTransferStatusSchema } from '~~/shared/pageStudio/completed-managed-transfer-management'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { requireCustomerInspectionAuthority } from '~~/shared/pageStudio/customerInspectionAuthority'
import { readCustomerSession } from './customerSignup'
import { withCustomerProductionAuthoringAuthority } from './customerAuthoringAuthority'
import { readCurrentManagedTransferCompletion } from './managedTransferCompletionRead'
import { callCompletedManagedTransfer } from './completedManagedTransfer'

type Dependencies = { env: Record<string, unknown>, runTransaction?: RunPageStudioTransaction }
const denied = () => createError({ statusCode: 403, statusMessage: 'Website access changed. Refresh your dashboard.' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Connection status could not be confirmed. Refresh before trying again.' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Refresh the current transfer status before continuing.' })
const production = (env: Record<string, unknown>) => env.PAGE_STUDIO_CONTENT_ENVIRONMENT === 'production' && env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT === 'production'
const enabled = (env: Record<string, unknown>) => production(env) && readCustomerActivation(env).productionEditorEnabled === true
interface SavedProgress { entitlement_id: string, resources_bound: boolean, source_frozen: boolean, destination_requested: boolean, destination_verified: boolean, copy_verified: boolean, history_verified: boolean }
function stage(row: SavedProgress, entitlementId: string): Extract<CustomerManagedTransfer, { completed: false }>['stage'] {
  if (row.entitlement_id !== entitlementId) return 'needs-attention'
  if (row.copy_verified && row.history_verified) return 'verifying'
  if (row.destination_verified) return 'copying-content'
  if (row.destination_requested) return 'preparing-destination'
  if (row.resources_bound || row.source_frozen) return 'freezing-source'
  return 'preparing-resources'
}
/** Native read only. No original transfer session is consulted and no phase is
 * resumed. Historical stage evidence never implies a currently running worker. */
async function snapshot(token: string, siteId: string, dependencies: Dependencies) {
  if (!/^[A-Za-z0-9_-]{64}$/.test(token) || !z.uuid().safeParse(siteId).success) throw denied()
  const loginSessionHash = await digestPortalSessionToken(token)
  return (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
    const row = (await db.query<{ entitlement_id: string }>('SELECT entitlement_id FROM page_studio_sites WHERE id=$1', [siteId])).rows[0]
    if (!row) throw denied()
    return withCustomerProductionAuthoringAuthority({ loginSessionHash, siteId, entitlementId: row.entitlement_id }, async (tx, authority) => {
      const completion = await readCurrentManagedTransferCompletion(tx, authority.scope)
      const identity = { identityId: authority.identityId, accountId: authority.accountId, workspaceId: authority.workspaceId,
        entitlementId: authority.entitlementId, scope: authority.scope, completionDigest: completion?.digest ?? null }
      if (completion) return { identity, completion: true as const, progress: null }
      const saved = (await tx.query<SavedProgress>(`SELECT intent.entitlement_id,
        EXISTS(SELECT 1 FROM page_studio_managed_transfer_resource_bindings r WHERE r.operation_id=intent.operation_id AND r.intent_digest=intent.intent_digest) AS resources_bound,
        EXISTS(SELECT 1 FROM page_studio_managed_transfer_source_drafts s WHERE s.operation_id=intent.operation_id AND s.intent_digest=intent.intent_digest) AS source_frozen,
        EXISTS(SELECT 1 FROM page_studio_managed_transfer_destination_catalogues d WHERE d.operation_id=intent.operation_id AND d.intent_digest=intent.intent_digest) AS destination_requested,
        EXISTS(SELECT 1 FROM page_studio_managed_transfer_destination_execution_verifications d WHERE d.operation_id=intent.operation_id AND d.intent_digest=intent.intent_digest) AS destination_verified,
        EXISTS(SELECT 1 FROM page_studio_managed_transfer_copy_graph_verifications c WHERE c.operation_id=intent.operation_id AND c.intent_digest=intent.intent_digest) AS copy_verified,
        EXISTS(SELECT 1 FROM page_studio_managed_transfer_forms_history_verifications h WHERE h.operation_id=intent.operation_id AND h.intent_digest=intent.intent_digest) AS history_verified
        FROM page_studio_managed_transfer_intents intent WHERE intent.site_id=$1 AND intent.tenant_id=$2 AND intent.client_id=$3 FOR SHARE OF intent NOWAIT`,
      [siteId, authority.scope.tenantId, authority.scope.clientId])).rows
      if (saved.length > 1) throw conflict()
      const progress = saved[0] ? CustomerManagedTransferSchema.parse({ siteId, completed: false, stage: stage(saved[0], authority.entitlementId), canRetryConnection: false, canRetryRetention: false }) : null
      return { identity, completion: false as const, progress }
    }, { runTransaction: work => work(db) })
  })
}
const closed = (siteId: string): CustomerManagedTransfer => ({ siteId, completed: true, stage: 'completed', editorConnection: 'unavailable', sourceRetention: 'unavailable', canRetryConnection: false, canRetryRetention: false })
async function observed(token: string, siteId: string, action: 'status' | 'connect' | 'retain', dependencies: Dependencies, pinnedIdentity?: unknown) {
  const before = await snapshot(token, siteId, dependencies)
  if (pinnedIdentity && collectionCanonical(pinnedIdentity) !== collectionCanonical(before.identity)) throw denied()
  if (!before.completion) {
    if (action !== 'status') throw conflict()
    return { projection: before.progress, identity: before.identity }
  }
  if (!enabled(dependencies.env)) {
    if (action !== 'status') throw conflict()
    return { projection: closed(siteId), identity: before.identity }
  }
  customerDestinationGuard(dependencies.env)?.(before.identity.workspaceId)
  let value: CustomerManagedTransfer = closed(siteId), failed = false
  try {
    const result = CompletedManagedTransferStatusSchema.parse(structuredClone(await callCompletedManagedTransfer({ siteId, action }, { env: dependencies.env })))
    if (result.siteId !== siteId) throw conflict()
    value = CustomerManagedTransferSchema.parse({ ...result, stage: 'completed' })
  } catch { failed = true }
  const after = await snapshot(token, siteId, dependencies)
  if (!after.completion || collectionCanonical(before.identity) !== collectionCanonical(after.identity)) throw denied()
  if (!enabled(dependencies.env)) throw denied()
  customerDestinationGuard(dependencies.env)?.(after.identity.workspaceId)
  if (failed && action !== 'status') throw unavailable()
  return { projection: value, identity: before.identity }
}
/** Inspection-only fallback. An immutable completed fact can suppress obsolete
 * staging controls even when publishing access expires. It confers no authoring
 * capability, exposes no private proof and never invokes the management worker. */
async function inspectionCompletion(token: string, siteId: string, dependencies: Dependencies) {
  return (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
    const run: RunPageStudioTransaction = work => work(db)
    const user = await readCustomerSession(token, run)
    const actor = { actorId: user.identityId, accountId: user.accountId, siteId }
    const access = await requireCustomerInspectionAuthority(db, actor)
    const scopeKey = contentScopeKey({ tenantId: access.tenantId, businessId: access.clientId, clientId: access.clientId, siteId, environment: 'production' })
    const rows = (await db.query(`SELECT terminal.operation_id
      FROM page_studio_managed_transfer_completions terminal
      JOIN page_studio_managed_transfer_intents intent ON intent.operation_id=terminal.operation_id AND intent.intent_digest=terminal.intent_digest
      WHERE intent.site_id=$1 AND intent.tenant_id=$2 AND intent.client_id=$3 AND terminal.destination_scope_key=$4
      FOR SHARE OF terminal,intent NOWAIT`, [siteId, access.tenantId, access.clientId, scopeKey])).rows
    if (rows.length > 1) throw conflict()
    const finalUser = await readCustomerSession(token, run)
    const finalAccess = await requireCustomerInspectionAuthority(db, actor)
    if (finalUser.identityId !== user.identityId || finalUser.accountId !== user.accountId
      || collectionCanonical(access) !== collectionCanonical(finalAccess)) throw denied()
    return rows.length ? closed(siteId) : null
  })
}
export async function readCustomerManagedTransfer(token: string, siteId: string, dependencies: Dependencies): Promise<CustomerManagedTransfer | null> {
  if (!production(dependencies.env)) return null
  try {
    return (await observed(token, siteId, 'status', dependencies)).projection
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode !== 403) throw error
    return inspectionCompletion(token, siteId, dependencies)
  }
}
/** Explicit customer intent. Server derives the exact operation; browser-supplied
 * proofs/scopes are rejected. Never replay an uncertain mutation automatically. */
export async function recoverCustomerManagedTransfer(token: string, siteId: string, input: unknown, dependencies: Dependencies) {
  const request = CustomerManagedTransferRecoverySchema.parse(input)
  if (!enabled(dependencies.env)) throw conflict()
  const current = await observed(token, siteId, 'status', dependencies)
  if (!current.projection?.completed || !(request.action === 'retry-connection' ? current.projection.canRetryConnection : current.projection.canRetryRetention)) throw conflict()
  return (await observed(token, siteId, request.action === 'retry-connection' ? 'connect' : 'retain', dependencies, current.identity)).projection
}
