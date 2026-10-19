import { z } from 'zod'
import { FormDraftHistoryImportReceiptSchema } from './managed-transfer-forms-history'
import { PageStudioContentScopeSchema as ContentScopeSchema } from './businessContent'
import { CmsStorageTargetSchema, ReleaseSha256Schema as Digest } from './cmsManaged'
import {
  ManagedTransferCompletionReceiptSchema,
  requireManagedTransferCompletionReceipt
} from './managed-transfer-completion'
import {
  ManagedTransferDestinationExecutionRequestSchema,
  requireMatchingManagedTransferDestinationExecutionRequest
} from './managed-transfer-destination-execution'
import { ManagedTransferDestinationExecutionProofSchema, requireMatchingManagedTransferDestinationExecutionProof } from './managed-transfer-destination-execution-result'
import { collectionCanonical as canonicalJson, collectionDigest } from './collectionApi'

export const ManagedTransferDestinationAuthoringRequestSchema = z
  .object({
    completionReceipt: ManagedTransferCompletionReceiptSchema,
    destinationProof: ManagedTransferDestinationExecutionProofSchema,
    destinationRequest: ManagedTransferDestinationExecutionRequestSchema,
    formatVersion: z.literal(1),
    historyReceipt: FormDraftHistoryImportReceiptSchema,
    historyReceiptDigest: Digest,
    intentDigest: Digest,
    operationId: z.uuid()
  })
  .strict()
export const ManagedTransferDestinationAuthoringGrantSchema = z
  .object({
    completionDigest: Digest,
    digest: Digest,
    executionIdentity: Digest,
    formatVersion: z.literal(1),
    formsReceiptDigest: Digest,
    freezeDigest: Digest,
    generation: z.uuid(),
    historyReceiptDigest: Digest,
    intentDigest: Digest,
    operationId: z.uuid(),
    runtimeDigest: Digest,
    scope: ContentScopeSchema,
    target: CmsStorageTargetSchema,
    workerEtag: z.string().min(1).max(256)
  })
  .strict()
export const ManagedTransferDestinationAuthoringAuthorizationSchema = z
  .object({
    action: z.enum(['install', 'read']),
    request: ManagedTransferDestinationAuthoringRequestSchema
  })
  .strict()
export type ManagedTransferDestinationAuthoringRequest = z.infer<
  typeof ManagedTransferDestinationAuthoringRequestSchema
>
export type ManagedTransferDestinationAuthoringGrant = z.infer<
  typeof ManagedTransferDestinationAuthoringGrantSchema
>
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b)
const invalid = () =>
  new Error('Completed destination authoring identity is inconsistent')
/** This deterministic grant carries no authority on its own. The selector must
 * independently authorize the current native completion and physical runtime. */
export async function planManagedTransferDestinationAuthoring(input: unknown) {
  const request = ManagedTransferDestinationAuthoringRequestSchema.parse(input)
  if (new TextEncoder().encode(canonicalJson(request)).byteLength > 262_144) {
    throw invalid()
  }
  const completion = await requireManagedTransferCompletionReceipt(
    request.completionReceipt
  )
  const executionRequest
    = await requireMatchingManagedTransferDestinationExecutionRequest(
      request.destinationRequest
    )
  const proof = await requireMatchingManagedTransferDestinationExecutionProof(
    request.destinationProof,
    executionRequest
  )
  const { execution, route } = proof.envelope
  const { digest: historyDigest, destinationHistoryDigest, importIdentityDigest, ...historyIdentity } = request.historyReceipt
  if (
    completion.operationId !== request.operationId
    || completion.intentDigest !== request.intentDigest
    || executionRequest.operationId !== request.operationId
    || executionRequest.intentDigest !== request.intentDigest
    || completion.historyReceiptDigest !== request.historyReceiptDigest
    || historyDigest !== request.historyReceiptDigest
    || request.historyReceipt.transferId !== request.operationId
    || request.historyReceipt.nativeIntentDigest !== request.intentDigest
    || !same(request.historyReceipt.destination.scope, completion.destination.scope)
    || !same(request.historyReceipt.destination.target, completion.destination.target)
    || !same(request.historyReceipt.source.scope, completion.source.scope)
    || !same(request.historyReceipt.source.target, completion.source.target)
    || importIdentityDigest !== await collectionDigest(historyIdentity)
    || historyDigest !== await collectionDigest({ ...historyIdentity, destinationHistoryDigest, importIdentityDigest })
    || !same(completion.destination.scope, executionRequest.freezeRequest.scope)
    || !same(
      completion.destination.target,
      executionRequest.freezeRequest.target
    )
    || completion.destination.freezeDigest !== execution.freeze.digest
  ) {
    throw invalid()
  }
  const body = {
    completionDigest: completion.digest,
    executionIdentity: execution.identity,
    formatVersion: 1 as const,
    formsReceiptDigest: route.formDrafts.digest,
    freezeDigest: completion.destination.freezeDigest,
    generation: completion.destination.generation,
    historyReceiptDigest: request.historyReceiptDigest,
    intentDigest: request.intentDigest,
    operationId: request.operationId,
    runtimeDigest: execution.owner.runtimeDigest,
    scope: completion.destination.scope,
    target: completion.destination.target,
    workerEtag: execution.workerReceipt.etag
  }
  const grant = ManagedTransferDestinationAuthoringGrantSchema.parse({
    ...body,
    digest: await collectionDigest(body)
  })
  return { grant, request }
}
export async function planManagedTransferDestinationAuthoringGrant(
  input: unknown
) {
  return (await planManagedTransferDestinationAuthoring(input)).grant
}
export async function requireMatchingManagedTransferDestinationAuthoringGrant(
  input: unknown,
  request: unknown
) {
  const observed = ManagedTransferDestinationAuthoringGrantSchema.parse(input),
    expected = await planManagedTransferDestinationAuthoringGrant(request)
  if (!same(observed, expected)) {
    throw invalid()
  }
  return observed
}

const statusReference = { operationId: z.uuid(), intentDigest: Digest, requestDigest: Digest }
export const ManagedTransferDestinationAuthoringStatusSchema = z.discriminatedUnion('state', [
  z.object({ ...statusReference, state: z.enum(['not-started', 'disabled']) }).strict(),
  z.object({ ...statusReference, state: z.literal('ready'), grantDigest: Digest }).strict()
])
export async function requireMatchingManagedTransferDestinationAuthoringStatus(input: unknown, requestInput: unknown) {
  const observed = ManagedTransferDestinationAuthoringStatusSchema.parse(input), { request, grant } = await planManagedTransferDestinationAuthoring(requestInput)
  if (observed.operationId !== request.operationId || observed.intentDigest !== request.intentDigest
    || observed.requestDigest !== await collectionDigest(request) || (observed.state === 'ready' && observed.grantDigest !== grant.digest)) throw invalid()
  return observed
}
