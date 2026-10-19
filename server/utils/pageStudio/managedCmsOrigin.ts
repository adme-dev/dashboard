import { createError } from 'h3'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import type { PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import { readManagedCmsAdoptionReceipt } from './cmsAdoptionReceipt'
import { readCurrentManagedTransferCompletion } from './managedTransferCompletionRead'

/** Caller holds current customer/site authority and the sole managed scope lock.
 * Completion provenance grants no original-session or public-release authority. */
export async function readManagedCmsOrigin(db: PageStudioQueryClient, scope: PageStudioContentScope) {
  const rows = (await db.query<{ state: string, adoption_id: string | null, transfer_id: string | null }>(
    'SELECT state,adoption_id,to_jsonb(scope)->>\'transfer_id\' AS transfer_id FROM page_studio_cms_scopes scope WHERE scope_key=$1 FOR SHARE', [contentScopeKey(scope)]
  )).rows
  const row = rows.length === 1 ? rows[0] : undefined
  const denied = () => createError({ statusCode: 409, statusMessage: 'Managed website origin is not available' })
  if (!row || row.state !== 'managed') throw denied()
  if (row.adoption_id && !row.transfer_id) return { kind: 'adoption' as const, receipt: await readManagedCmsAdoptionReceipt(db, scope) }
  if (!row.adoption_id && row.transfer_id) {
    const receipt = await readCurrentManagedTransferCompletion(db, scope)
    if (!receipt || receipt.operationId !== row.transfer_id) throw denied()
    return { kind: 'transfer' as const, receipt }
  }
  throw denied()
}
