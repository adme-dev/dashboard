import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { collectionCanonical as canonical, collectionDigest as digest } from '~~/shared/pageStudio/collectionApi'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { requireManagedTransferCompletionReceipt } from '~~/shared/pageStudio/managed-transfer-completion'
import { requireMatchingManagedTransferFormsHistoryStatus } from '~~/shared/pageStudio/managed-transfer-forms-history-result'
import { ManagedTransferReferenceSchema as Reference, withManagedTransferIntentAuthority, assertManagedTransferSource } from '~~/server/utils/pageStudio/managedTransferIntent'
import { retainedManagedTransferCompletion } from '~~/server/utils/pageStudio/managedTransferCompletionRead'
import { retainedManagedTransferFormsHistoryVerification } from '~~/server/utils/pageStudio/managedTransferFormsHistoryCoordinator'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { readVerifiedCopyGraph } from './managedTransferCopyCoordinator'
import { verifyManagedTransferCopyGraphStatus } from './generated/managed-transfer-copy/managedTransferCopyVerifier.mjs'
import { CopyGraphStatusSchema } from './transfer/copyGraphContract'

type Dependencies = { env: Record<string, unknown>, runTransaction?: RunPageStudioTransaction }
type Intent = Parameters<Parameters<typeof withManagedTransferIntentAuthority>[1]>[1]
type Copy = NonNullable<Awaited<ReturnType<typeof readVerifiedCopyGraph>>>
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)
const conflict = () => createError({ statusCode: 409, statusMessage: 'Transfer verification or the original website changed. Check the saved transfer status.' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Transfer completion inspection is unavailable. Check saved status before retrying.' })
async function inputs(db: PageStudioQueryClient, intent: Intent, env: Record<string, unknown>) {
  await assertManagedTransferSource(db, intent)
  const copy = await readVerifiedCopyGraph(db, intent, env)
  const history = await retainedManagedTransferFormsHistoryVerification(db, intent, env)
  if (!copy || !history || !same(copy.context.sourceRequest, history.request.sourceRequest)
    || !same(copy.context.destinationRequest, history.request.destinationRequest) || !same(copy.context.destinationProof, history.request.destinationProof)) throw conflict()
  return { copy, history }
}
function objectMapping(copy: Copy) {
  const destinationIds = new Map<string, string>()
  for (const pair of copy.proof.copyReceipt.objects) {
    const source = copy.request.sourceObjects.find(object => same(object.pin, pair.source))
    const id = copy.request.objectIds.find(object => object.sourceObjectId === source?.nativeId)?.destinationObjectId
    if (!id || destinationIds.has(canonical(pair.destination))) throw conflict()
    destinationIds.set(canonical(pair.destination), id)
  }
  const idFor = (pin: unknown) => {
    const id = destinationIds.get(canonical(pin))
    if (!id) throw conflict()
    return id
  }
  if (destinationIds.size !== copy.proof.destinationObjects.length) throw conflict()
  return { idFor, contentId: copy.proof.copyReceipt.contentHead ? idFor(copy.proof.copyReceipt.contentHead) : null }
}
async function select(db: PageStudioQueryClient, intent: Intent, current: Awaited<ReturnType<typeof inputs>>) {
  const { copy, history } = current, base = copy.proof.graphReceipt.graph.base, scope = base.scope
  const sourceKey = contentScopeKey(intent.authority.source), destinationKey = contentScopeKey(scope)
  const { idFor, contentId } = objectMapping(copy), auditId = randomUUID()
  const body = { formatVersion: 1, operationId: intent.operationId, intentDigest: await digest(intent), copyProofDigest: copy.proofDigest,
    historyReceiptDigest: history.receiptDigest, auditId, completedAt: new Date().toISOString(),
    source: { scope: intent.authority.source, generation: intent.source.context.state.active_generation, target: intent.source.context.state.target,
      freezeDigest: intent.source.context.state.freeze_digest, application: { id: intent.source.context.application.id, digest: intent.source.context.application.digest },
      checkpoint: { id: intent.source.checkpoint.id, digest: intent.source.checkpoint.digest }, contentId: intent.source.context.state.current_content_id },
    destination: { scope, generation: base.generation, target: base.target, freezeDigest: base.freezeDigest,
      application: { id: base.application.manifest.applicationId, digest: base.application.digest }, checkpoint: { id: base.checkpoint.id, digest: base.checkpoint.digest }, contentId } }
  const receipt = await requireManagedTransferCompletionReceipt({ ...body, digest: await digest(body) })
  await db.query(`INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
    VALUES($1,$2,$3,$4,$5,'agency','managed-transfer.completed','managed-transfer',$6,$7,$8)`, [auditId, scope.tenantId, scope.clientId, scope.siteId,
    intent.authority.operatorId, intent.operationId, `transfer:${intent.operationId}:completed`, { intentDigest: receipt.intentDigest, receiptDigest: receipt.digest,
      sourceGeneration: receipt.source.generation, destinationGeneration: receipt.destination.generation, copyProofDigest: receipt.copyProofDigest, historyReceiptDigest: receipt.historyReceiptDigest }])
  const json = canonical(receipt)
  await db.query(`INSERT INTO page_studio_managed_transfer_completions(operation_id,intent_digest,source_scope_key,source_generation,destination_scope_key,destination_generation,
    copy_proof_digest,history_receipt_digest,receipt,receipt_json,receipt_digest,audit_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`,
  [intent.operationId, receipt.intentDigest, sourceKey, receipt.source.generation, destinationKey, base.generation, copy.proofDigest, history.receiptDigest, json, json, receipt.digest, auditId])
  const changed = await db.query(`UPDATE page_studio_cms_scopes SET state='retained',retained_by_transfer_id=$2 WHERE scope_key=$1 AND state='managed' AND active_generation=$3 RETURNING scope_key`,
    [sourceKey, intent.operationId, receipt.source.generation])
  if (changed.rows.length !== 1) throw conflict()
  await db.query(`INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,transfer_id,active_generation,target,freeze_digest,current_application_id,current_content_id)
    VALUES($1,$2,$3,$3,$4,'production','managed',$5,$6,$7,$8,$9,$10)`, [destinationKey, scope.tenantId, scope.clientId, scope.siteId, intent.operationId, base.generation, base.target, base.freezeDigest, receipt.destination.application.id, contentId])
  for (const object of copy.proof.destinationObjects) {
    const pin = object.pin
    await db.query(`INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,baseline_head,actor_id,created_at,transfer_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,$12,$13)`, [destinationKey, base.generation, idFor(pin), pin.kind, pin.collectionId, pin.recordId, pin.version, pin,
      object.schema ? idFor(object.schema) : null, pin.kind === 'record' ? (object.body as { archived: boolean }).archived : null, object.actorId, object.createdAt, intent.operationId])
  }
  await db.query(`INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,previous_application_id,transfer_id) VALUES($1,$2,$3,$4,$5,NULL,$6)`,
    [destinationKey, base.generation, base.application.manifest.applicationId, base.application.digest, base.application.manifest, intent.operationId])
  for (const schema of base.application.manifest.schemas) await db.query(`INSERT INTO page_studio_cms_application_schemas(scope_key,generation,application_id,collection_id,object_id) VALUES($1,$2,$3,$4,$5)`,
    [destinationKey, base.generation, base.application.manifest.applicationId, schema.collectionId, schema.objectId])
  for (const head of intent.source.recordHeads) {
    const id = copy.request.objectIds.find(object => object.sourceObjectId === head.objectId)?.destinationObjectId
    if (!id) throw conflict()
    await db.query(`INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) VALUES($1,$2,$3,$4,$5)`, [destinationKey, base.generation, head.collectionId, head.recordId, id])
  }
  const cp = copy.proof.graphReceipt.checkpoint, metadata = copy.request.checkpointMetadata
  await db.query(`INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,author_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [base.checkpoint.id, scope.tenantId, scope.clientId, scope.siteId, cp.digest, cp.objectKey, cp.etag, metadata.userId, metadata.createdAt])
  // Authoring changes only. Live release, activation and host pointers are untouched.
  const site = await db.query(`UPDATE page_studio_sites SET current_checkpoint_id=$4,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND client_id=$2 AND id=$3 AND current_checkpoint_id=$5 RETURNING id`, [scope.tenantId, scope.clientId, scope.siteId, base.checkpoint.id, intent.source.checkpoint.id])
  if (site.rows.length !== 1) throw conflict()
  return receipt
}
/** No SQL locks span provider I/O. Retained verification alone cannot finalize:
 * inspect both physical stores, then compare all original native clocks/heads
 * and proofs inside the final original-authority transaction. */
export async function completeManagedTransfer(input: unknown, dependencies: Dependencies) {
  const reference = Reference.parse(input)
  if (dependencies.env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  const service = dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined
  const inspectCopy = capturePageStudioRpcMethod(service, 'inspectManagedTransferCopyGraph')
  const inspectHistory = capturePageStudioRpcMethod(service, 'inspectManagedTransferFormsHistory')
  const before = await withManagedTransferIntentAuthority(reference, async (db, intent) => {
    const completed = await retainedManagedTransferCompletion(db, intent)
    return completed ? { completed } : { original: await inputs(db, intent, dependencies.env) }
  }, dependencies)
  if (before.completed) return before.completed
  const original = before.original!
  if (!inspectCopy || !inspectHistory) throw unavailable()
  const copy = CopyGraphStatusSchema.parse(await verifyManagedTransferCopyGraphStatus(structuredClone(await inspectCopy(structuredClone(original.copy.context))), original.copy.context))
  if (copy.state !== 'ready' || !same(copy.proof, original.copy.proof)) throw conflict()
  const history = await requireMatchingManagedTransferFormsHistoryStatus(structuredClone(await inspectHistory(structuredClone(original.history.request))), original.history.request, original.history.receipt)
  if (history.state !== 'ready') throw conflict()
  return withManagedTransferIntentAuthority(reference, async (db, intent) => {
    const completed = await retainedManagedTransferCompletion(db, intent)
    if (completed) return completed
    const current = await inputs(db, intent, dependencies.env)
    if (!same(current, original)) throw conflict()
    return select(db, intent, current)
  }, dependencies)
}
