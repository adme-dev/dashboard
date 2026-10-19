// Private provisioning identity only. This request never grants an active route.
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest } from './collectionApi'
import { CmsFreezeRequestSchema, CmsStorageTargetSchema, ReleaseSha256Schema as Digest } from './cmsManaged'
import { DispatchWorkerIntentSchema } from './managed-transfer-execution'
import { ManagedTransferDestinationCatalogueRequestSchema } from './managed-transfer-destination-catalogue'
import { ManagedTransferDestinationCatalogueReceiptSchema, planManagedTransferDestinationCatalogue } from './managed-transfer-destination-catalogue-result'

const Runtime = z.object({ compatibilityDate: z.iso.date(), digest: Digest }).strict()
export const ManagedTransferDestinationExecutionPolicySchema = z.object({ version: z.literal(1), kind: z.literal('managed-draft-import'),
  from: Runtime, to: Runtime, formReceiptDigest: Digest }).strict()
export const ManagedTransferDestinationExecutionRequestSchema = z.object({ formatVersion: z.literal(1), operationId: z.uuid(), intentDigest: Digest,
  catalogueRequest: ManagedTransferDestinationCatalogueRequestSchema, catalogueReceipt: ManagedTransferDestinationCatalogueReceiptSchema,
  policy: ManagedTransferDestinationExecutionPolicySchema, successor: DispatchWorkerIntentSchema, freezeRequest: CmsFreezeRequestSchema
}).strict()
export const ManagedTransferDestinationExecutionAuthorizationSchema = z.object({ action: z.enum(['prepare', 'read']),
  request: ManagedTransferDestinationExecutionRequestSchema }).strict()

/** Rebuild all destination identity from the exact original catalogue. A freeze
 * request is planned here; only actual tenant D1 may supply its later receipt. */
export async function planManagedTransferDestinationExecution(catalogueRequest: unknown, catalogueReceipt: unknown, policyInput: unknown) {
  const plan = await planManagedTransferDestinationCatalogue(catalogueRequest)
  const receipt = ManagedTransferDestinationCatalogueReceiptSchema.parse(catalogueReceipt)
  const policy = ManagedTransferDestinationExecutionPolicySchema.parse(policyInput)
  if (canonical(receipt) !== canonical(plan.receipt)) throw new Error('Prepared destination catalogue mismatch')
  const { etag: _etag, ...predecessor } = plan.request.baseline.worker
  if (policy.formReceiptDigest !== plan.receiptDigests.forms
    || canonical(policy.from) !== canonical({ compatibilityDate: predecessor.compatibilityDate, digest: predecessor.runtimeDigest })
    || policy.to.digest === predecessor.runtimeDigest) throw new Error('Prepared destination runtime policy mismatch')
  const reference = { operationId: plan.request.operationId, intentDigest: plan.request.intentDigest }
  const identity = await collectionDigest({ ...reference, catalogueRequestDigest: plan.requestDigest,
    catalogueReceiptDigest: receipt.digest, predecessor, policy })
  const successor = DispatchWorkerIntentSchema.parse({ ...predecessor, compatibilityDate: policy.to.compatibilityDate, runtimeDigest: policy.to.digest,
    scriptName: `ps-content-${identity.slice(0, 32)}`, ownerTag: `ps-owner-${(await collectionDigest({ identity, purpose: 'owner' })).slice(0, 32)}` })
  if (successor.scriptName === predecessor.scriptName || successor.ownerTag === predecessor.ownerTag) throw new Error('Prepared destination successor must be distinct')
  const baseline = plan.request.baseline
  const target = CmsStorageTargetSchema.parse({ accountId: baseline.database.accountId, databaseId: baseline.database.databaseId,
    name: baseline.database.name, routeId: baseline.preparationId, runtimeDigest: predecessor.runtimeDigest,
    collectionReceiptDigest: receipt.receiptDigests.collection, workflowReceiptDigest: receipt.receiptDigests.workflow,
    stagingReceiptDigest: receipt.receiptDigests.staging })
  const attachment = plan.request.resourceRequest.resourceRequest
  const freezeRequest = CmsFreezeRequestSchema.parse({ formatVersion: 1, adoptionId: `transfer_${reference.operationId}_destination`,
    actor: attachment.actor, scope: attachment.scope, target })
  const request = ManagedTransferDestinationExecutionRequestSchema.parse({ formatVersion: 1, ...reference,
    catalogueRequest: plan.request, catalogueReceipt: receipt, policy, successor, freezeRequest })
  if (new TextEncoder().encode(canonical(request)).byteLength > 65536) throw new Error('Prepared destination request too large')
  return request
}
export async function requireMatchingManagedTransferDestinationExecutionRequest(input: unknown) {
  const request = ManagedTransferDestinationExecutionRequestSchema.parse(input)
  const expected = await planManagedTransferDestinationExecution(request.catalogueRequest, request.catalogueReceipt, request.policy)
  if (canonical(request) !== canonical(expected)) throw new Error('Prepared destination execution identity mismatch')
  return request
}
