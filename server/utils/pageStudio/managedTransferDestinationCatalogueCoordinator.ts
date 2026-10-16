import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferDestinationCatalogueStatusSchema as Status, planManagedTransferDestinationCatalogue } from '~~/shared/pageStudio/managed-transfer-destination-catalogue-result'
import { ManagedTransferReferenceSchema as Reference, withReservedManagedTransfer } from './managedTransferIntent'
import { prepareManagedTransferDestinationCatalogue, retainedManagedTransferDestinationCatalogue } from './managedTransferDestinationCatalogue'
import { capturePageStudioRpcMethod } from './privateRpc'
import type { RunPageStudioTransaction } from './sites'

const conflict = () => createError({ statusCode: 409, statusMessage: 'Managed destination catalogue evidence changed' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Managed destination catalogue preparation is unavailable' })

/** Private preparation progress. Only an explicit, independently inspected
 * verification retains native evidence. This is a historical prerequisite,
 * never authority to select the destination or publish it. Final selection
 * must independently inspect the later extended catalogue and runtime. */
export async function coordinateManagedTransferDestinationCatalogue(input: unknown, dependencies: {
  env: Record<string, unknown>
  runTransaction?: RunPageStudioTransaction
}) {
  const parsed = Reference.extend({ action: z.enum(['status', 'start', 'resume', 'verify']) }).strict().safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid destination catalogue action' })
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  const { action, ...reference } = parsed.data, options = { runTransaction: dependencies.runTransaction }
  const methods = { status: 'readManagedTransferDestinationCatalogue', start: 'prepareManagedTransferDestinationCatalogue',
    resume: 'prepareManagedTransferDestinationCatalogue', verify: 'inspectManagedTransferDestinationCatalogue' }
  const remote = capturePageStudioRpcMethod(dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined, methods[action])
  const read = () => withReservedManagedTransfer(reference, retainedManagedTransferDestinationCatalogue, options)
  const result = (state: string) => ({ operationId: reference.operationId, state })
  let original = (await read()).saved
  if (!original && action === 'status') return result('not-started')
  if (!original && action !== 'start') throw conflict()
  if (!remote) throw unavailable()
  if (action === 'start') original = await prepareManagedTransferDestinationCatalogue(reference, dependencies)
  if (!original) throw conflict()
  const plan = await planManagedTransferDestinationCatalogue(original)
  // Both request and response are detached. A hostile RPC may mutate its own
  // argument, but cannot change the retained request or the expected plan.
  const observed = Status.safeParse(await remote(structuredClone(original), ...(['start', 'resume'].includes(action) ? [action] : [])))
  if (!observed.success) throw conflict()
  const status = observed.data
  if (status.operationId !== reference.operationId || status.intentDigest !== reference.intentDigest
    || status.requestDigest !== plan.requestDigest || status.planDigest !== plan.planDigest
    || (status.state === 'ready' && canonical(status.receipt) !== canonical(plan.receipt))) throw conflict()
  return withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await retainedManagedTransferDestinationCatalogue(db, intent)
    if (!current.saved || canonical(current.saved) !== canonical(original)) throw conflict()
    if (action === 'verify' && status.state === 'ready') {
      const row = (await db.query<{ intent_digest: string, request_digest: string, plan_digest: string, receipt: unknown, receipt_digest: string }>(
        `SELECT intent_digest,request_digest,plan_digest,receipt,receipt_digest
          FROM page_studio_managed_transfer_catalogue_verifications WHERE operation_id=$1`, [reference.operationId])).rows[0]
      if (row) {
        if (row.intent_digest !== reference.intentDigest || row.request_digest !== plan.requestDigest
          || row.plan_digest !== plan.planDigest || row.receipt_digest !== plan.receipt.digest
          || canonical(row.receipt) !== canonical(plan.receipt)) throw conflict()
      } else {
        // The site lock and original-authority post-check serialize retries and
        // roll back this evidence if any original source authority changes.
        await db.query(`INSERT INTO page_studio_managed_transfer_catalogue_verifications
          (operation_id,intent_digest,request_digest,plan_digest,receipt,receipt_digest)
          VALUES($1,$2,$3,$4,$5::jsonb,$6)`, [reference.operationId, reference.intentDigest,
          await collectionDigest(current.saved), plan.planDigest, JSON.stringify(plan.receipt), plan.receipt.digest])
      }
      return result('catalogue-verified')
    }
    return result(status.state)
  }, options)
}
