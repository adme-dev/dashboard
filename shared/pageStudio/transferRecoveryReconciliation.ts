import { z } from 'zod'
import { PageStudioContentScopeSchema as ContentScopeSchema } from './businessContent'
import { CmsStorageTargetSchema } from './cmsManaged'
import { TransferRecoveryInventoryRequestSchema } from './transferRecoveryInventory'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Id = z.string().uuid()
const Version = z.number().int().positive().max(2147483646)
const Recovery = TransferRecoveryInventoryRequestSchema.shape.recovery
// Exact wire mirror of Studio's managed-transfer-recovery-inventory-contract.
const RegistryAbsence = z.object({
  executions: z.literal(0), uploads: z.literal(0), destinations: z.literal(0), authoring: z.literal(0),
}).strict();
const PhysicalAbsence = z.object({
  transferSchema: z.literal(0), transferFences: z.literal(0), importSchema: z.literal(0), imports: z.literal(0),
  preparations: z.literal(0), preparedObjects: z.literal(0),
}).strict();
/** Observation evidence, never an execution grant. Every zero requires a
 * successful scoped query; the caller cannot supply this result as authority. */
export const ManagedTransferRecoveryInventorySchema = z.object({
  kind: z.literal("completed-early-phase-inventory"), version: z.literal(1), envelopeDigest: Digest,
  recovery: Recovery,
  resources: z.object({
    // SHA256(canonicalJson(exact ManagedTransferPhysicalResources)).
    digest: Digest, resourceIdentity: z.string().regex(/^cms_attach_[a-f0-9]{64}$/), databaseId: z.uuid(),
  }).strict(),
  catalogue: z.object({
    requestDigest: Digest, planDigest: Digest, receiptDigest: Digest,
    verifiedPhases: z.tuple([z.literal("collection"), z.literal("workflow"), z.literal("staging"), z.literal("forms")]),
    snapshotDigest: Digest,
  }).strict(),
  source: z.object({
    scope: ContentScopeSchema, target: CmsStorageTargetSchema, freezeDigest: Digest,
    checkpointDigest: Digest, registryDigest: Digest, workerDigest: Digest, physicalDigest: Digest, historyDigest: Digest,
  }).strict(),
  destination: z.object({ registryDigest: Digest, physicalDigest: Digest, historyDigest: Digest }).strict(),
  later: z.object({
    sourceRegistry: RegistryAbsence, destinationRegistry: RegistryAbsence,
    sourcePhysical: PhysicalAbsence,
    destinationPhysical: PhysicalAbsence.extend({ cutovers: z.literal(0) }).strict(),
  }).strict(),
  noninterference: z.object({
    version: z.literal(1), resources: z.literal("complete-one-shot-effects"), catalogue: z.literal("complete-four-phase-effects"),
    catalogueBarrierDigest: Digest, source: z.literal("exact-adoption-freeze"),
    later: z.literal("fresh-pg-admission-and-physical-absence"),
  }).strict(),
}).strict();

export const TransferRecoveryReconciliationCaptureSchema = z.object({
  captureId: Id, inventory: TransferRecoveryInventoryRequestSchema
}).strict()
export const TransferRecoveryReconciliationInvariantSchema = z.object({
  formatVersion: z.literal(1), captureId: Id, invocationDigest: Digest,
  authority: z.object({ requestId: Id, requestRevision: Version, operationId: Id, intentDigest: Digest,
    recoveryId: Id, epoch: Version, pgVersion: Version, d1Version: Version, deadline: z.string().datetime() }).strict(),
  principals: z.object({ siteId: Id, accountId: Id, identityId: Id, workspaceId: Id, operatorId: Id }).strict(),
  sourceDataDigest: Digest,
  pg: z.object({ resourceBindingDigest: Digest, catalogueRequestDigest: Digest, catalogueReceiptDigest: Digest,
    later: z.object({ sourceExecution: z.literal(0), sourceDrafts: z.literal(0), destinationExecution: z.literal(0),
      destinationVerification: z.literal(0), copyRequest: z.literal(0), copyVerification: z.literal(0),
      formsHistoryRequest: z.literal(0), formsHistoryVerification: z.literal(0), completion: z.literal(0) }).strict()
  }).strict(),
  observation: ManagedTransferRecoveryInventorySchema
}).strict()
export const TransferRecoveryReconciliationReceiptSchema = z.object({
  invariant: TransferRecoveryReconciliationInvariantSchema, digest: Digest,
  observedStartedAt: z.string().datetime(), observedCompletedAt: z.string().datetime()
}).strict()
export const TransferRecoveryReconciliationResultSchema = z.object({
  historical: z.boolean(), receipt: TransferRecoveryReconciliationReceiptSchema
}).strict()
export const TransferRecoveryReconciliationReadSchema = z.object({
  siteId: Id, requestId: Id, expectedRevision: Version, captureId: Id,
  operator: z.object({ actorId: Id, loginSessionHash: Digest }).strict()
}).strict()
