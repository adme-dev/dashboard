import { createError } from 'h3'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { requireManagedTransferCompletionReceipt } from '~~/shared/pageStudio/managed-transfer-completion'
import { PageStudioContentScopeSchema as CmsContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import type { withManagedTransferIntentAuthority } from './managedTransferIntent'
import { assertSoleCmsAuthoringScope } from './cmsGraphRead'

type Intent = Parameters<Parameters<typeof withManagedTransferIntentAuthority>[1]>[1]
const conflict = () => createError({ statusCode: 409, statusMessage: 'The saved transfer completion or destination changed' })
const same = (left: unknown, right: unknown) => canonical(left) === canonical(right)
/** Caller holds original native intent authority and site lock. Recovery reads
 * the committed receipt; it never replays allocation/copy or restores old heads.
 * Later accepted destination edits are deliberately allowed. */
async function readCompletion(db: PageStudioQueryClient, intent: Intent) {
  const rows = (await db.query<Record<string, unknown>>(`SELECT terminal.*,to_jsonb(source) AS source,to_jsonb(destination) AS destination,
    copy.intent_digest AS copy_intent_digest,copy.proof_digest AS verified_copy_digest,
    history.intent_digest AS history_intent_digest,history.receipt_digest AS verified_history_digest
    FROM page_studio_managed_transfer_completions terminal
    JOIN page_studio_cms_scopes source ON source.scope_key=terminal.source_scope_key
    JOIN page_studio_cms_scopes destination ON destination.scope_key=terminal.destination_scope_key
    JOIN page_studio_managed_transfer_copy_graph_verifications copy ON copy.operation_id=terminal.operation_id
    JOIN page_studio_managed_transfer_forms_history_verifications history ON history.operation_id=terminal.operation_id
    WHERE terminal.operation_id=$1 FOR SHARE OF terminal,source,destination,copy,history NOWAIT`, [intent.operationId])).rows
  if (!rows.length) return null
  if (rows.length !== 1) throw conflict()
  const row = rows[0]!, receipt = await requireManagedTransferCompletionReceipt(row.receipt)
  const source = row.source as Record<string, unknown>, destination = row.destination as Record<string, unknown>
  const expectedSource = { scope: intent.authority.source, generation: intent.source.context.state.active_generation,
    target: intent.source.context.state.target, freezeDigest: intent.source.context.state.freeze_digest,
    application: { id: intent.source.context.application.id, digest: intent.source.context.application.digest },
    checkpoint: { id: intent.source.checkpoint.id, digest: intent.source.checkpoint.digest }, contentId: intent.source.context.state.current_content_id }
  if (receipt.operationId !== intent.operationId || receipt.intentDigest !== await collectionDigest(intent)
    || row.operation_id !== receipt.operationId || row.intent_digest !== receipt.intentDigest
    || row.receipt_digest !== receipt.digest || row.receipt_json !== canonical(receipt) || row.audit_id !== receipt.auditId
    || row.copy_proof_digest !== receipt.copyProofDigest || row.verified_copy_digest !== receipt.copyProofDigest || row.copy_intent_digest !== receipt.intentDigest
    || row.history_receipt_digest !== receipt.historyReceiptDigest || row.verified_history_digest !== receipt.historyReceiptDigest || row.history_intent_digest !== receipt.intentDigest
    || row.source_scope_key !== contentScopeKey(receipt.source.scope) || row.source_generation !== receipt.source.generation
    || row.destination_scope_key !== contentScopeKey(receipt.destination.scope) || row.destination_generation !== receipt.destination.generation
    || !same(receipt.source, expectedSource) || !same(receipt.destination.scope, intent.authority.destination) || receipt.destination.generation !== intent.destination.generation
    || source.state !== 'retained' || source.retained_by_transfer_id !== receipt.operationId || source.scope_key !== row.source_scope_key
    || source.active_generation !== receipt.source.generation || !same(source.target, receipt.source.target) || source.freeze_digest !== receipt.source.freezeDigest
    || source.current_application_id !== receipt.source.application.id || source.current_content_id !== receipt.source.contentId
    || destination.state !== 'managed' || destination.transfer_id !== receipt.operationId || destination.scope_key !== row.destination_scope_key
    || destination.active_generation !== receipt.destination.generation || !same(destination.target, receipt.destination.target) || destination.freeze_digest !== receipt.destination.freezeDigest) throw conflict()
  await assertSoleCmsAuthoringScope(db, receipt.destination.scope)
  return receipt
}

/** Original transfer recovery retains its original-principal authority boundary. */
export async function retainedManagedTransferCompletion(db: PageStudioQueryClient, intent: Intent) {
  return readCompletion(db, intent)
}

/** Immutable provenance only. Caller MUST hold current native owner/plan authority
 * and the site lock. Unlike transfer recovery, normal authoring never borrows an
 * old operator or customer login. Current generation/target/freeze remain pinned;
 * accepted destination drafts may advance after the original completion.
 */
export async function readCurrentManagedTransferCompletion(db: PageStudioQueryClient, input: unknown) {
  const scope = CmsContentScopeSchema.parse(input)
  if (scope.environment !== 'production') throw conflict()
  const rows = (await db.query<{ intent: Intent, intent_digest: string }>(`SELECT intent.intent,intent.intent_digest
    FROM page_studio_managed_transfer_completions terminal
    JOIN page_studio_managed_transfer_intents intent ON intent.operation_id=terminal.operation_id
    WHERE terminal.destination_scope_key=$1
    FOR SHARE OF terminal,intent NOWAIT`, [contentScopeKey(scope)])).rows
  if (!rows.length) return null
  if (rows.length !== 1) throw conflict()
  const row = rows[0]!
  if (!row.intent || row.intent_digest !== await collectionDigest(row.intent)
    || !same(row.intent.authority.destination, scope)) throw conflict()
  const receipt = await readCompletion(db, row.intent)
  if (!receipt || !same(receipt.destination.scope, scope)) throw conflict()
  return receipt
}
