// Private native mirror of the reviewed Studio destination execution proof.
// Reconstruct every route, schema and worker relationship from retained admission.
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest as digest } from './collectionApi'
import { CmsFreezeReceiptSchema, CmsStorageTargetSchema, ReleaseScopedIdSchema, ReleaseSha256Schema as Digest } from './cmsManaged'
import { PageStudioContentScopeSchema as ContentScopeSchema } from './businessContent'
import { FormDraftsUpgradeReceiptSchema } from './form-drafts-upgrade'
import { DispatchWorkerIntentSchema } from './managed-transfer-execution'
import { ManagedTransferDestinationCatalogueReceiptSchema } from './managed-transfer-destination-catalogue-result'
import { ManagedTransferDestinationExecutionPolicySchema, requireMatchingManagedTransferDestinationExecutionRequest } from './managed-transfer-destination-execution'

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)
const denied = () => new Error('Prepared destination execution identity mismatch')
// Pinned from the existing independently verified destination-only import layout.
export const ManagedTransferDestinationImportSchemaDigest = '65fbb83440cd62ebc9165006a6a25daa414212181209c06e7be771a624434680'
const WorkerReceipt = z.object({ etag: z.string().min(1).max(200) }).strict()
export const ManagedTransferDestinationImportReceiptSchema = z.object({ formatVersion: z.literal(1), kind: z.literal('draft-history-import'),
  operationId: ReleaseScopedIdSchema, nativeIntentDigest: Digest, predecessor: FormDraftsUpgradeReceiptSchema,
  schemaDigest: z.literal(ManagedTransferDestinationImportSchemaDigest), digest: Digest }).strict()
const PrivateRoute = z.object({ activationId: z.uuid(),
  formDrafts: z.object({ digest: Digest, receipt: FormDraftsUpgradeReceiptSchema }).strict(),
  namespace: z.literal('xeroflow-page-studio-dispatch-production'),
  receipts: z.object({ collection: ManagedTransferDestinationCatalogueReceiptSchema.shape.receipts.shape.collection,
    workflow: ManagedTransferDestinationCatalogueReceiptSchema.shape.receipts.shape.workflow,
    staging: ManagedTransferDestinationCatalogueReceiptSchema.shape.receipts.shape.staging }).strict(),
  scope: ContentScopeSchema, scriptName: DispatchWorkerIntentSchema.shape.scriptName, target: CmsStorageTargetSchema }).strict()
export const ManagedTransferDestinationExecutionEnvelopeSchema = z.object({ kind: z.literal('managed-execution'), route: PrivateRoute,
  execution: z.object({ formatVersion: z.literal(1), freeze: CmsFreezeReceiptSchema, identity: Digest, originalRouteDigest: Digest,
    owner: DispatchWorkerIntentSchema, policy: ManagedTransferDestinationExecutionPolicySchema, predecessor: DispatchWorkerIntentSchema,
    schemaReceipt: ManagedTransferDestinationImportReceiptSchema, workerReceipt: WorkerReceipt }).strict() }).strict()
export const ManagedTransferDestinationExecutionProofSchema = z.object({ formatVersion: z.literal(1), operationId: z.uuid(), intentDigest: Digest,
  requestDigest: Digest, catalogueReceiptDigest: Digest, envelope: ManagedTransferDestinationExecutionEnvelopeSchema, digest: Digest }).strict()
export const ManagedTransferDestinationExecutionStatusSchema = z.discriminatedUnion('state', [
  z.object({ operationId: z.uuid(), intentDigest: Digest, requestDigest: Digest,
    state: z.enum(['resume-required', 'pending', 'upload-uncertain', 'disabled']) }).strict(),
  z.object({ operationId: z.uuid(), intentDigest: Digest, requestDigest: Digest, state: z.literal('ready'), identity: Digest,
    proof: ManagedTransferDestinationExecutionProofSchema }).strict()
])

export async function planManagedTransferDestinationImportReceipt(input: unknown) {
  const request = await requireMatchingManagedTransferDestinationExecutionRequest(input)
  const body = { formatVersion: 1 as const, kind: 'draft-history-import' as const,
    operationId: `transfer_${request.operationId}_destination_import`, nativeIntentDigest: request.intentDigest,
    predecessor: request.catalogueReceipt.receipts.forms, schemaDigest: ManagedTransferDestinationImportSchemaDigest }
  return ManagedTransferDestinationImportReceiptSchema.parse({ ...body, digest: await digest(body) })
}

/** The freeze timestamp and worker etag are actual independent observations.
 * Everything else is reconstructed from the original native request. */
export async function planManagedTransferDestinationExecutionProof(input: unknown, freezeInput: unknown, workerInput: unknown) {
  const freeze = CmsFreezeReceiptSchema.parse(freezeInput), workerReceipt = WorkerReceipt.parse(workerInput)
  const request = await requireMatchingManagedTransferDestinationExecutionRequest(input)
  const { digest: freezeDigest, ...freezeBody } = freeze
  if (!same(freeze.request, request.freezeRequest) || freezeDigest !== await digest(freezeBody)) throw denied()
  const { etag: _etag, ...predecessor } = request.catalogueRequest.baseline.worker
  const catalogue = request.catalogueReceipt
  const route = PrivateRoute.parse({ activationId: request.catalogueRequest.baseline.preparationId,
    formDrafts: { digest: catalogue.receiptDigests.forms, receipt: catalogue.receipts.forms }, namespace: predecessor.namespace,
    receipts: { collection: catalogue.receipts.collection, workflow: catalogue.receipts.workflow, staging: catalogue.receipts.staging },
    scope: request.freezeRequest.scope, scriptName: predecessor.scriptName, target: request.freezeRequest.target })
  const schemaReceipt = await planManagedTransferDestinationImportReceipt(request)
  const body = { formatVersion: 1 as const, freeze, originalRouteDigest: await digest(route), owner: request.successor,
    policy: request.policy, predecessor, schemaReceipt, workerReceipt }
  const envelope = ManagedTransferDestinationExecutionEnvelopeSchema.parse({ kind: 'managed-execution', route,
    execution: { ...body, identity: await digest(body) } })
  const proofBody = { formatVersion: 1 as const, operationId: request.operationId, intentDigest: request.intentDigest,
    requestDigest: await digest(request), catalogueReceiptDigest: catalogue.digest, envelope }
  return ManagedTransferDestinationExecutionProofSchema.parse({ ...proofBody, digest: await digest(proofBody) })
}
export async function requireMatchingManagedTransferDestinationExecutionProof(input: unknown, requestInput: unknown) {
  const proof = ManagedTransferDestinationExecutionProofSchema.parse(input)
  const expected = await planManagedTransferDestinationExecutionProof(requestInput, proof.envelope.execution.freeze, proof.envelope.execution.workerReceipt)
  if (!same(proof, expected)) throw denied()
  return proof
}
export async function requireMatchingManagedTransferDestinationExecutionStatus(input: unknown, requestInput: unknown) {
  const status = ManagedTransferDestinationExecutionStatusSchema.parse(input)
  const request = await requireMatchingManagedTransferDestinationExecutionRequest(requestInput)
  if (status.operationId !== request.operationId || status.intentDigest !== request.intentDigest || status.requestDigest !== await digest(request)) throw denied()
  if (status.state === 'ready') {
    const proof = await requireMatchingManagedTransferDestinationExecutionProof(status.proof, request)
    if (status.identity !== proof.envelope.execution.identity) throw denied()
  }
  return status
}
