// Private mirror of Studio's deterministic destination catalogue protocol.
// Every own phase is rebuilt from native admission before accepting evidence.
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest } from './collectionApi'
import { requireMatchingManagedTransferDestinationCatalogueRequest } from './managed-transfer-destination-catalogue'
import { CollectionUpgradeOperationSchema } from './collection-upgrade'
import { WorkflowUpgradeOperationSchema } from './workflow-upgrade'
import { CollectionStagingUpgradeOperationSchema } from './collection-staging-upgrade'
import { FormDraftsUpgradeReceiptSchema } from './form-drafts-upgrade'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
export const ManagedTransferDestinationCataloguePhases = ['collection', 'workflow', 'staging', 'forms'] as const
const Phases = ManagedTransferDestinationCataloguePhases
export const ManagedTransferDestinationCatalogueReceiptsSchema = z.object({
  collection: CollectionUpgradeOperationSchema.omit({ actor: true, policyVersion: true, version: true }).strict(),
  workflow: WorkflowUpgradeOperationSchema.omit({ actor: true, policyVersion: true, version: true }).strict(),
  staging: CollectionStagingUpgradeOperationSchema.omit({ actor: true, policyVersion: true, version: true }).strict(),
  forms: FormDraftsUpgradeReceiptSchema
}).strict()
const Digests = z.object({ collection: Digest, workflow: Digest, staging: Digest, forms: Digest }).strict()
export const ManagedTransferDestinationCatalogueReceiptSchema = z.object({
  formatVersion: z.literal(1), operationId: z.uuid(), intentDigest: Digest,
  requestDigest: Digest, baselineDigest: Digest, planDigest: Digest,
  receipts: ManagedTransferDestinationCatalogueReceiptsSchema, receiptDigests: Digests, digest: Digest
}).strict()
const Prefix = z.array(z.enum(Phases)).max(4).refine(values => values.every((kind, i) => kind === Phases[i]),
  'Catalogue phases must be an exact ordered prefix')
const StatusIdentity = z.object({ operationId: z.uuid(), intentDigest: Digest, requestDigest: Digest, planDigest: Digest })
export const ManagedTransferDestinationCatalogueStatusSchema = z.discriminatedUnion('state', [
  StatusIdentity.extend({ state: z.enum(['not-started', 'resume-required', 'disabled']), completedPhases: Prefix }).strict(),
  StatusIdentity.extend({ state: z.literal('ready'), completedPhases: Prefix.length(4), receipt: ManagedTransferDestinationCatalogueReceiptSchema }).strict()
]).superRefine((value, ctx) => {
  if (value.state === 'not-started' && value.completedPhases.length !== 0) {
    ctx.addIssue({ code: 'custom', message: 'Not-started catalogue must have no completed phases' })
  }
})

/** Deterministic plan matches Studio, including phase ordinals, all predecessor
 * operation IDs and each catalogue hash. The native immutable request supplies
 * account/database/scope; remote fields never choose any of them. */
export async function planManagedTransferDestinationCatalogue(input: unknown) {
  const request = await requireMatchingManagedTransferDestinationCatalogueRequest(input)
  const physical = request.baseline.database
  const base = { accountId: physical.accountId, databaseId: physical.databaseId,
    name: physical.name, scope: request.resourceRequest.resourceRequest.scope }
  const id = `transfer_${request.operationId}`
  const intents = {
    collection: { ...base, operationId: `${id}_collection` },
    workflow: { ...base, operationId: `${id}_workflow`, collectionOperationId: `${id}_collection` },
    staging: { ...base, operationId: `${id}_staging`, collectionOperationId: `${id}_collection`, workflowOperationId: `${id}_workflow` },
    forms: { ...base, operationId: `${id}_forms`, collectionOperationId: `${id}_collection`,
      workflowOperationId: `${id}_workflow`, stagingOperationId: `${id}_staging` }
  }
  const receipts = ManagedTransferDestinationCatalogueReceiptsSchema.parse({
    collection: { ...intents.collection, sourceDigest: CollectionUpgradeOperationSchema.shape.sourceDigest.value,
      targetDigest: CollectionUpgradeOperationSchema.shape.targetDigest.value },
    workflow: { ...intents.workflow, sourceDigest: WorkflowUpgradeOperationSchema.shape.sourceDigest.value,
      targetDigest: WorkflowUpgradeOperationSchema.shape.targetDigest.value },
    staging: { ...intents.staging, sourceDigest: CollectionStagingUpgradeOperationSchema.shape.sourceDigest.value,
      targetDigest: CollectionStagingUpgradeOperationSchema.shape.targetDigest.value },
    forms: { ...intents.forms, sourceDigest: FormDraftsUpgradeReceiptSchema.shape.sourceDigest.value,
      targetDigest: FormDraftsUpgradeReceiptSchema.shape.targetDigest.value }
  })
  const receiptDigests = Digests.parse(Object.fromEntries(await Promise.all(Phases.map(async kind =>
    [kind, await collectionDigest(receipts[kind])]))))
  const requestDigest = await collectionDigest(request)
  const baselineDigest = await collectionDigest(request.baseline)
  const steps = Phases.map((kind, ordinal) => ({ kind, ordinal, intent: intents[kind], receipt: receipts[kind], receiptDigest: receiptDigests[kind] }))
  const plan = { formatVersion: 1, requestDigest, phases: steps }
  const planJson = canonical(plan)
  if (new TextEncoder().encode(planJson).byteLength > 65536) throw new Error('Catalogue plan too large')
  const planDigest = await collectionDigest(plan)
  const receiptBody = { formatVersion: 1 as const, operationId: request.operationId, intentDigest: request.intentDigest,
    requestDigest, baselineDigest, planDigest, receipts, receiptDigests }
  const receipt = ManagedTransferDestinationCatalogueReceiptSchema.parse({ ...receiptBody, digest: await collectionDigest(receiptBody) })
  return { request, requestDigest, baselineDigest, planDigest, planJson, intents, receipts, receiptDigests, steps, receipt }
}
