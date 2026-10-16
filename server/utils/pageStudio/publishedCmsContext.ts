import { CmsApplicationManifestSchema, contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import type { PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import type { PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { requireManagedTransferCompletionReceipt } from '~~/shared/pageStudio/managed-transfer-completion'
import { assertSoleCmsAuthoringScope } from './cmsGraphRead'
import { cmsContextColumns, cmsContextFrom, cmsEqual, cmsUnavailable, decodeCmsContext, decodeRetainedCmsContext } from './cmsVisibility'

type Seal = { application: { id: string, digest: string }, checkpoint: string, generation: string, target: unknown, freezeDigest: string }
export type PublishedCmsContext = Awaited<ReturnType<typeof decodeCmsContext>> | Awaited<ReturnType<typeof decodeRetainedCmsContext>>
const admitted = new WeakMap<PublishedCmsContext, string>()
export function assertPublishedCmsContext(context: PublishedCmsContext) {
  if (admitted.get(context) !== collectionCanonical(context)) throw cmsUnavailable()
}
/** Only invoked after current host, live pointer/epoch, activation, seal and owner
 * authority. Retention never grants an editor access to the former generation. */
export async function lockPublishedCmsContext(db: PageStudioControlQueryClient, scope: PageStudioContentScope, seal: Seal): Promise<PublishedCmsContext> {
  const rows = (await db.query<Record<string, unknown>>(`SELECT ${cmsContextColumns} ${cmsContextFrom} WHERE s.scope_key=$1 FOR UPDATE OF s`, [contentScopeKey(scope)])).rows
  if (rows.length !== 1) throw cmsUnavailable()
  const row = rows[0]!, raw = row.state as Record<string, unknown>
  let context: PublishedCmsContext
  if (raw.state === 'managed') {
    await assertSoleCmsAuthoringScope(db, scope)
    context = await decodeCmsContext(row, scope)
  } else {
    context = await decodeRetainedCmsContext(row, scope)
    const completions = (await db.query<Record<string, unknown>>('SELECT * FROM page_studio_managed_transfer_completions WHERE operation_id=$1 FOR SHARE NOWAIT', [raw.retained_by_transfer_id])).rows
    if (completions.length !== 1) throw cmsUnavailable()
    const saved = completions[0]!, receipt = await requireManagedTransferCompletionReceipt(saved.receipt)
    const source = receipt.source, destination = receipt.destination
    if (saved.operation_id !== receipt.operationId || raw.retained_by_transfer_id !== receipt.operationId
      || saved.intent_digest !== receipt.intentDigest || saved.receipt_digest !== receipt.digest
      || saved.receipt_json !== collectionCanonical(receipt) || saved.audit_id !== receipt.auditId
      || saved.copy_proof_digest !== receipt.copyProofDigest || saved.history_receipt_digest !== receipt.historyReceiptDigest
      || saved.source_scope_key !== contentScopeKey(source.scope) || saved.source_generation !== source.generation
      || saved.destination_scope_key !== contentScopeKey(destination.scope) || saved.destination_generation !== destination.generation
      || !cmsEqual(source.scope, scope) || source.generation !== context.state.active_generation
      || !cmsEqual(source.target, context.state.target) || source.freezeDigest !== context.state.freeze_digest
      || source.application.id !== context.application.id || source.application.digest !== context.application.digest
      || !cmsEqual(source.checkpoint, context.application.manifest.checkpoint) || source.contentId !== context.state.current_content_id) throw cmsUnavailable()
    await assertSoleCmsAuthoringScope(db, destination.scope)
    const destinations = (await db.query<Record<string, unknown>>(`SELECT * FROM page_studio_cms_scopes WHERE scope_key=$1 AND state='managed' FOR SHARE NOWAIT`, [contentScopeKey(destination.scope)])).rows
    const current = destinations[0]
    if (destinations.length !== 1 || current?.transfer_id !== receipt.operationId || current?.active_generation !== destination.generation
      || !cmsEqual(current?.target, destination.target) || current?.freeze_digest !== destination.freezeDigest) throw cmsUnavailable()
    // A live seal can predate the final draft. Verify its immutable history in
    // the retained generation, rather than substituting the final draft graph.
    const historical = (await db.query<Record<string, unknown>>(`SELECT a.digest,a.manifest,a.previous_application_id,cp.digest AS checkpoint_digest
      FROM page_studio_application_versions a JOIN page_studio_checkpoints cp ON cp.tenant_id=$4 AND cp.client_id=$5 AND cp.site_id=$6 AND cp.id=$7
      WHERE a.scope_key=$1 AND a.generation=$2 AND a.id=$3`, [contentScopeKey(scope), seal.generation, seal.application.id, scope.tenantId, scope.clientId, scope.siteId, seal.checkpoint])).rows
    if (historical.length !== 1) throw cmsUnavailable()
    const previous = historical[0]!, manifest = CmsApplicationManifestSchema.parse(previous.manifest)
    if (previous.digest !== seal.application.digest || await collectionDigest(manifest) !== seal.application.digest
      || manifest.applicationId !== seal.application.id || manifest.generation !== seal.generation || !cmsEqual(manifest.scope, scope)
      || manifest.previousApplicationId !== previous.previous_application_id || manifest.checkpoint.id !== seal.checkpoint
      || manifest.checkpoint.digest !== previous.checkpoint_digest) throw cmsUnavailable()
  }
  if (context.state.active_generation !== seal.generation || context.state.freeze_digest !== seal.freezeDigest || !cmsEqual(context.state.target, seal.target)) throw cmsUnavailable()
  admitted.set(context, collectionCanonical(context))
  return context
}
