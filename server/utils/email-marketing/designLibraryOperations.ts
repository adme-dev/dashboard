import { transactionWithoutRetry } from '~~/server/utils/db'
import { DesignModuleError } from '../../../shared/emailRendering/designModules'
import { AssetPublicationRequest, publishEmailAsset, type DesignAssetStorage } from './designAssets'
import type { DesignDb, DesignTransaction } from './designRevisions'
/** Revision and asset publication share the same actor/action namespace and
 * advisory lock. A retry can only replay its own immutable command receipt. */
export async function assertLibraryOperationNamespace(
  db: DesignDb,
  actorId: string,
  operationId: string,
  owner: 'revision' | 'asset'
) {
  const foreign = owner === 'revision' ? 'email_asset_publication_receipts' : 'email_design_revision_receipts'
  const prior = await db.query(`SELECT operation_id FROM ${foreign} WHERE actor_id=$1 AND operation_id=$2`, [
    actorId,
    operationId
  ])
  if (prior.rows.length) throw new DesignModuleError('IDEMPOTENCY_CONFLICT')
}
/** Wrap the existing registered-media publisher; do not introduce another asset
 * owner, descriptor store, delivery URL or upload contract. */
export async function publishDesignLibraryAsset(
  input: unknown,
  actorId: string,
  authorize: (scope: string | null) => Promise<void>,
  storage: DesignAssetStorage,
  transaction: DesignTransaction = cb => transactionWithoutRetry(db => cb(db))
) {
  const request = AssetPublicationRequest.parse(input)
  return transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${actorId}:${request.operationId}`])
    await assertLibraryOperationNamespace(db, actorId, request.operationId, 'asset')
    return publishEmailAsset(request, actorId, authorize, storage, cb => cb(db))
  })
}
