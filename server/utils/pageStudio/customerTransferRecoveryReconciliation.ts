import { createError } from 'h3'
import type { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { planManagedTransferDestinationCatalogue } from '~~/shared/pageStudio/managed-transfer-destination-catalogue-result'
import { ManagedTransferRecoveryInventorySchema, TransferRecoveryReconciliationCaptureSchema,
  TransferRecoveryReconciliationInvariantSchema, TransferRecoveryReconciliationReceiptSchema,
  TransferRecoveryReconciliationReadSchema } from '~~/shared/pageStudio/transferRecoveryReconciliation'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { authorizeCustomerTransferRecoveryInventory } from './customerTransferRecoveryInventory'
import { readCustomerTransferRecovery } from './customerTransferRecovery'
import type { assertManagedTransferSource } from './managedTransferIntent'

type Input = z.infer<typeof TransferRecoveryReconciliationCaptureSchema>
type Inventory = Input['inventory']
type Intent = Parameters<typeof assertManagedTransferSource>[1]
type Dependencies = { runTransaction?: RunPageStudioTransaction }
const denied = () => createError({ statusCode: 409, statusMessage: 'Complete recovery reconciliation is unavailable' })
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
const authorize = (db: PageStudioQueryClient, inventory: Inventory) =>
  authorizeCustomerTransferRecoveryInventory(inventory, { runTransaction: work => work(db) })
const receiptSelect = `SELECT invariant,invariant_json,invariant_digest,
  to_char(observed_started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS started,
  to_char(observed_completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed
  FROM page_studio_transfer_recovery_reconciliations WHERE capture_id=$1`

async function retained(db: PageStudioQueryClient, captureId: string) {
  const rows = (await db.query<{ invariant: unknown, invariant_json: string, invariant_digest: string, started: string, completed: string }>(receiptSelect, [captureId])).rows
  if (!rows.length) return null
  const row = rows[0]!, invariant = TransferRecoveryReconciliationInvariantSchema.parse(row.invariant)
  if (rows.length !== 1 || invariant.captureId !== captureId || row.invariant_json !== collectionCanonical(invariant)
    || row.invariant_digest !== await collectionDigest(invariant)) throw denied()
  return TransferRecoveryReconciliationReceiptSchema.parse({ invariant, digest: row.invariant_digest,
    observedStartedAt: row.started, observedCompletedAt: row.completed })
}
async function historicalAuthority(db: PageStudioQueryClient, input: z.infer<typeof TransferRecoveryReconciliationReadSchema>,
  receipt: z.infer<typeof TransferRecoveryReconciliationReceiptSchema>) {
  const { authority, principals } = receipt.invariant
  if (principals.siteId !== input.siteId || principals.operatorId !== input.operator.actorId
    || authority.requestId !== input.requestId || authority.requestRevision !== input.expectedRevision) throw denied()
  // Historical read deliberately does not refresh physical evidence or require
  // the old head deadline. Current original operator/mapping checks still apply.
  await readCustomerTransferRecovery({ siteId: input.siteId, requestId: input.requestId, operator: input.operator,
    query: { expectedRevision: input.expectedRevision } }, { runTransaction: work => work(db) })
}
async function snapshot(db: PageStudioQueryClient, inventory: Inventory) {
  await authorize(db, inventory)
  const intent = (await db.query<{ intent: Intent }>('SELECT intent FROM page_studio_managed_transfer_intents WHERE operation_id=$1',
    [inventory.request.operationId])).rows[0]?.intent
  const binding = (await db.query<{ binding_digest: string }>('SELECT binding_digest FROM page_studio_managed_transfer_resource_bindings WHERE operation_id=$1',
    [inventory.request.operationId])).rows[0]
  if (!intent || !binding) throw denied()
  const plan = await planManagedTransferDestinationCatalogue(inventory.catalogueRequest), pg = inventory.inspection.pg
  return { authority: { requestId: pg.requestId, requestRevision: pg.requestRevision,
    operationId: inventory.request.operationId, intentDigest: inventory.request.intentDigest,
    recoveryId: pg.recoveryId, epoch: pg.epoch, pgVersion: pg.version, d1Version: inventory.recovery.version, deadline: pg.deadline },
  principals: { siteId: intent.authority.source.siteId, ...intent.authority.owner, operatorId: inventory.inspection.operatorId },
  sourceDataDigest: await collectionDigest(intent.source), pg: { resourceBindingDigest: binding.binding_digest,
    catalogueRequestDigest: plan.requestDigest, catalogueReceiptDigest: plan.receipt.digest,
    // These explicit zeroes follow the mandatory complete nine-table query in
    // authorize(); a missing store or positive admission throws before here.
    later: { sourceExecution: 0 as const, sourceDrafts: 0 as const, destinationExecution: 0 as const,
      destinationVerification: 0 as const, copyRequest: 0 as const, copyVerification: 0 as const,
      formsHistoryRequest: 0 as const, formsHistoryVerification: 0 as const, completion: 0 as const } } }
}
async function validateObservation(inventory: Inventory, invocationDigest: string, value: unknown) {
  const observation = ManagedTransferRecoveryInventorySchema.parse(value)
  const plan = await planManagedTransferDestinationCatalogue(inventory.catalogueRequest), baseline = inventory.catalogueRequest.baseline
  if (observation.envelopeDigest !== invocationDigest || !same(observation.recovery, inventory.recovery)
    || observation.resources.digest !== await collectionDigest(baseline)
    || observation.resources.resourceIdentity !== baseline.resourceIdentity || observation.resources.databaseId !== baseline.database.databaseId
    || observation.catalogue.requestDigest !== plan.requestDigest || observation.catalogue.planDigest !== plan.planDigest
    || observation.catalogue.receiptDigest !== plan.receipt.digest
    || !same(observation.source.scope, inventory.source.scope) || !same(observation.source.target, inventory.source.target)
    || observation.source.freezeDigest !== inventory.source.freezeDigest || observation.source.checkpointDigest !== inventory.source.checkpoint.digest) throw denied()
  return observation
}

/** Trusted observer dependency only; no HTTP caller may supply observations.
 * Two short PG transactions bracket remote reads. A receipt records evidence;
 * it never selects a recovery head, renews consent or grants phase execution. */
export async function captureCustomerTransferRecoveryReconciliation(input: unknown,
  dependencies: Dependencies & { observe: (inventory: Inventory) => Promise<unknown> }) {
  const parsed = TransferRecoveryReconciliationCaptureSchema.parse(input)
  const { captureId, inventory } = parsed, observe = dependencies.observe
  const run = dependencies.runTransaction ?? transactionWithoutRetry
  if (typeof observe !== 'function') throw denied()
  const invocationDigest = await collectionDigest(inventory)
  const historicalInput = { siteId: inventory.source.scope.siteId, requestId: inventory.inspection.pg.requestId,
    expectedRevision: inventory.inspection.pg.requestRevision, captureId,
    operator: { actorId: inventory.inspection.operatorId, loginSessionHash: inventory.inspection.loginSessionHash } }
  const checkReplay = async (db: PageStudioQueryClient, receipt: NonNullable<Awaited<ReturnType<typeof retained>>>) => {
    if (receipt.invariant.invocationDigest !== invocationDigest) throw denied()
    await historicalAuthority(db, historicalInput, receipt)
    return { historical: true, receipt }
  }
  const before = await run(async (db) => {
    // Even replay is authenticated, but cannot refresh observation timestamps.
    const existing = await retained(db, captureId)
    if (existing) return { replay: await checkReplay(db, existing) }
    const captured = await snapshot(db, inventory)
    const started = (await db.query<{ started: string }>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS started`)).rows[0]?.started
    if (!started) throw denied()
    await authorize(db, inventory)
    return { captured, started }
  })
  if (before.replay) return before.replay
  // A detached copy prevents a dependency from mutating captured authority.
  const observation = await validateObservation(inventory, invocationDigest, await observe(structuredClone(inventory)))
  return run(async (db) => {
    const current = await snapshot(db, inventory)
    const existing = await retained(db, captureId)
    if (existing) return checkReplay(db, existing)
    if (!same(current, before.captured)) throw denied()
    const invariant = TransferRecoveryReconciliationInvariantSchema.parse({ formatVersion: 1, captureId, invocationDigest,
      ...current, observation })
    const canonical = collectionCanonical(invariant), digest = await collectionDigest(invariant), a = invariant.authority
    if (new TextEncoder().encode(canonical).byteLength > 65536) throw denied()
    await db.query(`INSERT INTO page_studio_transfer_recovery_reconciliations
      (capture_id,operation_id,request_id,request_revision,intent_digest,recovery_id,epoch,pg_version,d1_version,
       invocation_digest,invariant,invariant_json,invariant_digest,observed_started_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [captureId,a.operationId,a.requestId,a.requestRevision,a.intentDigest,a.recoveryId,a.epoch,a.pgVersion,a.d1Version,
      invocationDigest,invariant,canonical,digest,before.started])
    const receipt = await retained(db, captureId)
    if (!receipt) throw denied()
    // Final locked principals/source/phase/head/clock proof follows all writes,
    // parsing and hashing; failure rolls the insert back.
    await authorize(db, inventory)
    return { historical: false, receipt }
  })
}

/** Explicit historical retrieval with a genuine fresh original operator login.
 * Unlike same-invocation replay, this never compares/normalizes login digests. */
export async function readCustomerTransferRecoveryReconciliation(input: unknown, dependencies: Dependencies = {}) {
  const parsed = TransferRecoveryReconciliationReadSchema.parse(input)
  return (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
    const receipt = await retained(db, parsed.captureId)
    if (!receipt) throw denied()
    await historicalAuthority(db, parsed, receipt)
    return { historical: true, receipt }
  })
}
