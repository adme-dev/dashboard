import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest as digest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferSourceRetentionAuthorizationSchema as Authorization,
  requireMatchingManagedTransferSourceRetentionRequest as matchRequest, requireMatchingManagedTransferSourceRetentionReceipt as matchReceipt } from '~~/shared/pageStudio/managed-transfer-source-retention'
import { ManagedTransferReferenceSchema as Reference } from '~~/server/utils/pageStudio/managedTransferIntent'
import { withCurrentCompletedManagedTransferAuthority } from './managedTransferDestinationAuthoring'
import { transactionWithoutRetry } from './cmsDatabase'
import { retainedManagedTransferSourceDrafts } from '~~/server/utils/pageStudio/managedTransferSourceDrafts'
import { retainedManagedTransferFormsHistoryVerification } from '~~/server/utils/pageStudio/managedTransferFormsHistoryCoordinator'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

type Dependencies = { env: Record<string, unknown>, runTransaction?: RunPageStudioTransaction }
const conflict = () => createError({ statusCode: 409, statusMessage: 'Committed transfer source retention is unavailable or changed' })
/** Post-completion retention uses current native ownership, not expired import
 * sessions. The original Forms fence and CMS freeze are different identities. Retention
 * preserves the exact historical frozen Forms digest recorded by 469, while the
 * current remote Forms marker may advance to retained after native completion. */
export async function readManagedTransferSourceRetention(input: unknown, dependencies: Dependencies) {
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw conflict()
  const reference = Reference.parse(input)
  const run = dependencies.runTransaction ?? transactionWithoutRetry
  const rows = await run(async db => (await db.query<{ site_id: string, intent_digest: string }>('SELECT site_id,intent_digest FROM page_studio_managed_transfer_intents WHERE operation_id=$1', [reference.operationId])).rows)
  if (rows.length !== 1 || rows[0]!.intent_digest !== reference.intentDigest) throw conflict()
  return withCurrentCompletedManagedTransferAuthority({ siteId: rows[0]!.site_id }, async (db, { intent, completion }) => {
    if (completion.operationId !== reference.operationId || completion.intentDigest !== reference.intentDigest) throw conflict()
    const source = await retainedManagedTransferSourceDrafts(db, intent)
    const history = await retainedManagedTransferFormsHistoryVerification(db, intent, dependencies.env)
    if (!source.saved || !history || canonical(source.saved) !== canonical(history.request.sourceRequest) || history.receiptDigest !== completion.historyReceiptDigest) throw conflict()
    const frozen = { state: 'frozen', request: source.saved.fenceIntent, identityDigest: await digest(source.saved.fenceIntent) }
    if (history.receipt.source.fenceDigest !== await digest(frozen) || source.execution.freeze.digest !== completion.source.freezeDigest) throw conflict()
    return matchRequest({ formatVersion: 1, operationId: intent.operationId, intentDigest: completion.intentDigest, sourceRequest: source.saved, completion })
  }, dependencies)
}
export async function authorizeManagedTransferSourceRetention(input: unknown, dependencies: Dependencies) {
  const auth = Authorization.parse(input), request = await matchRequest(auth.request)
  const actual = await readManagedTransferSourceRetention({ operationId: request.operationId, intentDigest: request.intentDigest }, dependencies)
  if (canonical(actual) !== canonical(request)) throw conflict()
  return auth
}
/** Explicit retain or read-only recovery; a lost acknowledgement never triggers
 * an automatic write retry and never rolls back the committed native handoff. */
export async function coordinateManagedTransferSourceRetention(input: unknown, dependencies: Dependencies) {
  const { action, ...reference } = Reference.extend({ action: z.enum(['status', 'retain']) }).strict().parse(input)
  const method = action === 'status' ? 'readManagedTransferSourceRetention' : 'retainManagedTransferSourceDrafts'
  const remote = capturePageStudioRpcMethod(dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined, method)
  const original = await readManagedTransferSourceRetention(reference, dependencies)
  if (!remote) throw createError({ statusCode: 503, statusMessage: 'Source retention is unavailable. Check saved status before retrying.' })
  const observed = await matchReceipt(structuredClone(await remote(structuredClone(original))), original, action === 'status' ? 'read' : 'retain')
  if (canonical(await readManagedTransferSourceRetention(reference, dependencies)) !== canonical(original)) throw conflict()
  return { operationId: reference.operationId, state: observed.state === 'retained' ? 'retained' : 'retention-pending' }
}
