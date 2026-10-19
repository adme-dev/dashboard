import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from './cmsDatabase'
import { collectionCanonical as canonical, collectionDigest as digest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferDestinationAuthoringAuthorizationSchema as Authorization, planManagedTransferDestinationAuthoring } from '~~/shared/pageStudio/managed-transfer-destination-authoring'
import { ManagedTransferDestinationExecutionPolicySchema as Policy, requireMatchingManagedTransferDestinationExecutionRequest as matchExecution } from '~~/shared/pageStudio/managed-transfer-destination-execution'
import { requireMatchingManagedTransferDestinationExecutionProof as matchProof } from '~~/shared/pageStudio/managed-transfer-destination-execution-result'
import { ManagedTransferFormsHistoryRequestSchema as History, FormDraftHistoryImportReceiptSchema as HistoryReceipt } from '~~/shared/pageStudio/managed-transfer-forms-history'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import type { withManagedTransferIntentAuthority } from '~~/server/utils/pageStudio/managedTransferIntent'
import { readCurrentManagedTransferCompletion } from '~~/server/utils/pageStudio/managedTransferCompletionRead'

const Input = z.object({ siteId: z.uuid() }).strict()
const Configuration = Policy.omit({ formReceiptDigest: true }).extend({ accountId: z.string().regex(/^[a-f0-9]{32}$/), namespace: z.literal('xeroflow-page-studio-dispatch-production') }).strict()
type Dependencies = { env: Record<string, unknown>, runTransaction?: RunPageStudioTransaction }
const denied = () => createError({ statusCode: 403, statusMessage: 'Current production destination authoring is unavailable' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Completed destination authoring proof changed' })
const same = (left: unknown, right: unknown) => canonical(left) === canonical(right)
function configuration(env: Record<string, unknown>) {
  if (env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw denied()
  try {
    return Configuration.parse(JSON.parse(String(env.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY)))
  } catch {
    throw denied()
  }
}
/** Machine-side storage selection authority, never a customer session. Current
 * native ownership and publishing entitlement are required; old transfer/setup
 * logins are deliberately irrelevant. Customer HTTP checks its own current user. */
async function currentOwner(db: PageStudioQueryClient, siteId: string) {
  const rows = (await db.query<Record<string, unknown>>(`SELECT identity.id AS identity_id,account.id AS account_id,workspace.id AS workspace_id,
    receipt.business_id,receipt.tenant_id,to_jsonb(entitlement) AS plan,membership.expires_at::text AS membership_expires_at
    FROM page_studio_customer_accounts account
    JOIN page_studio_customer_identities identity ON identity.id=account.identity_id
    JOIN page_studio_workspace_memberships membership ON membership.identity_id=identity.id
    JOIN page_studio_customer_workspaces workspace ON workspace.id=membership.workspace_id
    JOIN page_studio_business_owners owner ON owner.workspace_id=workspace.id
    JOIN page_studio_customer_site_requests receipt ON receipt.workspace_id=workspace.id AND receipt.business_id=owner.id
    JOIN page_studio_sites site ON site.id=receipt.site_id AND site.client_id=receipt.business_id AND site.tenant_id=receipt.tenant_id
    JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id AND entitlement.client_id=site.client_id AND entitlement.tenant_id=site.tenant_id
    WHERE site.id=$1 AND account.status='active' AND identity.status='active' AND identity.verified_at<=clock_timestamp()
      AND identity.issuer='studio' AND identity.subject=account.id::text AND identity.portal_user_id IS NULL
      AND workspace.status='active' AND owner.agency_client_id IS NULL AND receipt.tenant_id='studio-customer-' || owner.id::text
      AND membership.role='owner' AND membership.revoked_at IS NULL AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM page_studio_workspace_client_bindings legacy WHERE legacy.workspace_id=workspace.id)
      AND site.status IN ('draft','active') AND entitlement.status='active' AND entitlement.plan_key<>'customer_preview_v1'
      AND entitlement.effective_from<=clock_timestamp() AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
      AND entitlement.active_site_limit>0 AND entitlement.pages_per_site_limit>0
      AND entitlement.plan_metadata->'publishingEnabled'='true'::jsonb AND entitlement.plan_metadata->'managedBy'='"platform"'::jsonb
      AND jsonb_typeof(entitlement.plan_metadata->'allowedModules')='array' AND entitlement.plan_metadata->'allowedModules' @> '["business-content"]'::jsonb
    FOR SHARE OF account,identity,membership,workspace,owner,receipt,entitlement NOWAIT`, [siteId])).rows
  if (rows.length !== 1) throw denied()
  const row = rows[0]!
  return { fingerprint: canonical(row), scope: { tenantId: String(row.tenant_id), businessId: String(row.business_id), clientId: String(row.business_id), siteId, environment: 'production' as const } }
}
async function retained(db: PageStudioQueryClient, completion: NonNullable<Awaited<ReturnType<typeof readCurrentManagedTransferCompletion>>>, config: z.infer<typeof Configuration>) {
  const rows = (await db.query<{ execution: Record<string, unknown>, proof: Record<string, unknown>, history: Record<string, unknown>, verification: Record<string, unknown> }>(`SELECT to_jsonb(e) AS execution,to_jsonb(p) AS proof,to_jsonb(h) AS history,to_jsonb(v) AS verification
    FROM page_studio_managed_transfer_destination_executions e
    JOIN page_studio_managed_transfer_destination_execution_verifications p ON p.operation_id=e.operation_id
    JOIN page_studio_managed_transfer_forms_history_requests h ON h.operation_id=e.operation_id
    JOIN page_studio_managed_transfer_forms_history_verifications v ON v.operation_id=e.operation_id
    WHERE e.operation_id=$1 FOR SHARE OF e,p,h,v NOWAIT`, [completion.operationId])).rows
  if (rows.length !== 1) throw conflict()
  const { execution: e, proof: p, history: h, verification: v } = rows[0]!
  const execution = await matchExecution(e.request), proof = await matchProof(p.proof, execution)
  const history = History.parse(h.request), expected = HistoryReceipt.parse(h.expected_receipt), observed = HistoryReceipt.parse(v.receipt)
  const executionDigest = await digest(execution), historyDigest = await digest(history)
  const fence = { request: history.sourceRequest.fenceIntent, identityDigest: await digest(history.sourceRequest.fenceIntent), state: 'frozen' }
  const { formReceiptDigest: _form, ...policy } = execution.policy
  const { digest: receiptDigest, ...receiptBody } = observed
  const { destinationHistoryDigest: _history, importIdentityDigest, ...importIdentity } = receiptBody
  if (execution.operationId !== completion.operationId || execution.intentDigest !== completion.intentDigest
    || e.intent_digest !== completion.intentDigest || e.request_json !== canonical(execution) || e.request_digest !== executionDigest
    || e.account_id !== execution.successor.accountId || e.namespace !== execution.successor.namespace || e.script_name !== execution.successor.scriptName
    || config.accountId !== execution.successor.accountId || config.namespace !== execution.successor.namespace
    || !same(policy, { version: config.version, kind: config.kind, from: config.from, to: config.to })
    || p.intent_digest !== completion.intentDigest || p.request_digest !== executionDigest || p.proof_json !== canonical(proof) || p.proof_digest !== proof.digest || p.execution_identity !== proof.envelope.execution.identity
    || history.operationId !== completion.operationId || history.intentDigest !== completion.intentDigest || !same(history.destinationRequest, execution) || !same(history.destinationProof, proof)
    || history.sourceRequest.operationId !== completion.operationId || history.sourceRequest.intentDigest !== completion.intentDigest
    || history.sourceRequest.fenceIntent.transferId !== completion.operationId || history.sourceRequest.fenceIntent.nativeIntentDigest !== completion.intentDigest
    || history.importRequest.intent.transferId !== completion.operationId || history.importRequest.intent.nativeIntentDigest !== completion.intentDigest
    || !same(history.importRequest.intent.source.scope, completion.source.scope) || !same(history.importRequest.intent.source.target, completion.source.target)
    || !same(history.sourceRequest.fenceIntent.scope, completion.source.scope) || !same(history.sourceRequest.fenceIntent.target, completion.source.target)
    || !same(history.importRequest.intent.destination.scope, completion.destination.scope) || !same(history.importRequest.intent.destination.target, completion.destination.target)
    || history.importRequest.intent.source.fenceDigest !== await digest(fence)
    || h.intent_digest !== completion.intentDigest || h.request_json !== canonical(history) || h.request_digest !== historyDigest
    || h.source_request_digest !== await digest(history.sourceRequest) || h.destination_proof_digest !== proof.digest
    || h.expected_receipt_json !== canonical(expected) || h.expected_receipt_digest !== expected.digest
    || v.intent_digest !== completion.intentDigest || v.request_digest !== historyDigest || v.receipt_json !== canonical(observed) || v.receipt_digest !== observed.digest
    || !same(observed, expected) || observed.digest !== completion.historyReceiptDigest || receiptDigest !== await digest(receiptBody)
    || importIdentityDigest !== await digest(importIdentity) || observed.transferId !== completion.operationId || observed.nativeIntentDigest !== completion.intentDigest
    || observed.planDigest !== history.importRequest.planDigest || observed.source.historyDigest !== history.importRequest.historyDigest
    || observed.source.fenceDigest !== history.importRequest.intent.source.fenceDigest
    || !same(observed.source.scope, completion.source.scope) || !same(observed.source.target, completion.source.target)
    || !same(observed.destination.scope, completion.destination.scope) || !same(observed.destination.target, completion.destination.target)) throw conflict()
  return (await planManagedTransferDestinationAuthoring({ formatVersion: 1, operationId: completion.operationId, intentDigest: completion.intentDigest,
    completionReceipt: completion, destinationRequest: execution, destinationProof: proof, historyReceipt: observed, historyReceiptDigest: observed.digest })).request
}
type ImmutableIntent = Parameters<Parameters<typeof withManagedTransferIntentAuthority>[1]>[1]
/** SQL-only reusable post-completion authority. Never fabricate original login
 * authority or perform provider/RPC work under these locks. Callers using an
 * operation reference MUST match it to context.completion inside this callback. */
export async function withCurrentCompletedManagedTransferAuthority<T>(input: unknown, work: (db: PageStudioQueryClient, context: {
  scope: Awaited<ReturnType<typeof currentOwner>>['scope']
  completion: NonNullable<Awaited<ReturnType<typeof readCurrentManagedTransferCompletion>>>
  intent: ImmutableIntent
}) => Promise<T>, dependencies: Dependencies): Promise<T> {
  const { siteId } = Input.parse(input)
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production' || dependencies.env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production') throw denied()
  try {
    return await (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
      const initial = await currentOwner(db, siteId)
      if ((await db.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE NOWAIT', [siteId])).rows.length !== 1) throw denied()
      if (!same(await currentOwner(db, siteId), initial)) throw denied()
      const completion = await readCurrentManagedTransferCompletion(db, initial.scope)
      if (!completion) throw conflict()
      const rows = (await db.query<{ intent: ImmutableIntent, intent_digest: string }>('SELECT intent,intent_digest FROM page_studio_managed_transfer_intents WHERE operation_id=$1 FOR SHARE NOWAIT', [completion.operationId])).rows
      if (rows.length !== 1 || rows[0]!.intent_digest !== completion.intentDigest || await digest(rows[0]!.intent) !== completion.intentDigest) throw conflict()
      const result = structuredClone(await work(db, { scope: structuredClone(initial.scope), completion: structuredClone(completion), intent: structuredClone(rows[0]!.intent) }))
      const finalCompletion = await readCurrentManagedTransferCompletion(db, initial.scope)
      if (!same(finalCompletion, completion) || !same(await currentOwner(db, siteId), initial)
        || dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production' || dependencies.env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production') throw conflict()
      return result
    })
  } catch (error) {
    if ((error as { code?: string })?.code === '55P03') throw createError({ statusCode: 503, statusMessage: 'Current destination authoring is changing. Retry the same request.' })
    throw error
  }
}
/** Read retained proofs under current owner authority. Later accepted destination
 * edits may advance heads, while original generation/target/freeze stay pinned. */
export async function readManagedTransferDestinationAuthoring(input: unknown, dependencies: Dependencies) {
  const config = configuration(dependencies.env)
  const request = await withCurrentCompletedManagedTransferAuthority(input, async (db, { completion }) => {
    const request = await retained(db, completion, config)
    if (!same(configuration(dependencies.env), config)) throw conflict()
    return request
  }, dependencies)
  if (!same(configuration(dependencies.env), config)) throw conflict()
  return request
}
export async function authorizeManagedTransferDestinationAuthoring(input: unknown, dependencies: Dependencies) {
  const authorization = Authorization.parse(input)
  const expected = await readManagedTransferDestinationAuthoring({ siteId: authorization.request.completionReceipt.destination.scope.siteId }, dependencies)
  if (!same(expected, authorization.request)) throw denied()
  return authorization
}
