import { z } from 'zod'
import { collectionCanonical, collectionDigest } from './collectionApi'
import { PageStudioContentScopeSchema } from './businessContent'
import { CmsStorageTargetSchema, ReleaseScopedIdSchema } from './cmsManaged'
import { CollectionUpgradeOperationSchema } from './collection-upgrade'
import { WorkflowUpgradeOperationSchema } from './workflow-upgrade'
import { CollectionStagingUpgradeOperationSchema } from './collection-staging-upgrade'
import { FormDraftsUpgradeReceiptSchema } from './form-drafts-upgrade'
import { CmsAdoptionControlRequestSchema } from './cmsAdoptionControl'

const Id = z.string().uuid(),
  Digest = z.string().regex(/^[a-f0-9]{64}$/),
  Revision = z.number().int().min(1).max(2147483646)
const Scope = PageStudioContentScopeSchema.extend({ environment: z.literal('staging') }).strict()
const Capability = z
  .object({
    accountId: z.string(),
    activationId: Id,
    auditId: Id,
    createdAt: z.string().datetime(),
    databaseId: Id,
    identity: Digest,
    operationIdentity: Digest,
    receiptDigest: Digest,
    runtimeDigest: Digest,
    runtimeEtag: z.string().min(1),
    runtimeIdentity: Digest,
    scope: PageStudioContentScopeSchema
  })
  .strict()
// Exact native private selection mirror, with Forms required and no execution
// or transfer-authoring branch. This is storage proof, never user authority.
export const CustomerAdoptionStorageProofSchema = z
  .object({
    kind: z.literal('existing-native-adoption-source'),
    version: z.literal(1),
    selection: z
      .object({
        activationId: Id,
        formDrafts: z
          .object({ capability: Capability.optional(), digest: Digest, receipt: FormDraftsUpgradeReceiptSchema })
          .strict(),
        namespace: z.literal('xeroflow-page-studio-dispatch-staging'),
        receipts: z
          .object({
            collection: CollectionUpgradeOperationSchema.omit({ version: true, policyVersion: true, actor: true }),
            workflow: WorkflowUpgradeOperationSchema.omit({ version: true, policyVersion: true, actor: true }),
            staging: CollectionStagingUpgradeOperationSchema.omit({ version: true, policyVersion: true, actor: true })
          })
          .strict(),
        scope: Scope,
        scriptName: z.string().regex(/^ps-content-[a-f0-9]{32}$/),
        target: CmsStorageTargetSchema
      })
      .strict(),
    selectionDigest: Digest
  })
  .strict()
export async function verifyCustomerAdoptionStorageProof(input: unknown) {
  const proof = CustomerAdoptionStorageProofSchema.parse(input),
    r = proof.selection,
    t = r.target,
    p = r.receipts
  const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
  if (proof.selectionDigest !== (await collectionDigest(r)) || t.routeId !== r.activationId)
    throw new Error('Adoption storage selection mismatch')
  for (const receipt of [p.collection, p.workflow, p.staging, r.formDrafts.receipt]) {
    if (
      receipt.accountId !== t.accountId ||
      receipt.databaseId !== t.databaseId ||
      receipt.name !== t.name ||
      !same(receipt.scope, r.scope)
    )
      throw new Error('Adoption storage ownership mismatch')
  }
  if (
    p.workflow.collectionOperationId !== p.collection.operationId ||
    p.staging.collectionOperationId !== p.collection.operationId ||
    p.staging.workflowOperationId !== p.workflow.operationId ||
    r.formDrafts.receipt.collectionOperationId !== p.collection.operationId ||
    r.formDrafts.receipt.workflowOperationId !== p.workflow.operationId ||
    r.formDrafts.receipt.stagingOperationId !== p.staging.operationId ||
    t.collectionReceiptDigest !== (await collectionDigest(p.collection)) ||
    t.workflowReceiptDigest !== (await collectionDigest(p.workflow)) ||
    t.stagingReceiptDigest !== (await collectionDigest(p.staging)) ||
    r.formDrafts.digest !== (await collectionDigest(r.formDrafts.receipt))
  )
    throw new Error('Adoption storage predecessor mismatch')
  if (r.formDrafts.capability) {
    const { identity, ...body } = r.formDrafts.capability
    if (
      identity !== (await collectionDigest(body)) ||
      body.activationId !== r.activationId ||
      body.receiptDigest !== r.formDrafts.digest ||
      body.runtimeDigest !== t.runtimeDigest ||
      body.accountId !== t.accountId ||
      body.databaseId !== t.databaseId ||
      !same(body.scope, r.scope)
    )
      throw new Error('Adoption storage capability mismatch')
  }
  return proof
}
export const CustomerAdoptionOperatorSchema = z.object({ actorId: Id, loginSessionHash: Digest }).strict()
export const CustomerAdoptionGrantRequestSchema = z
  .object({
    grantId: Id,
    expectedGrantId: Id.nullable(),
    expectedRevision: z.number().int().min(0).max(2147483645),
    sourceDigest: Digest,
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .transform((v) => new Date(v).toISOString()),
    reason: z.string().trim().min(3).max(1000)
  })
  .strict()
  .refine((v) => (v.expectedRevision === 0) === (v.expectedGrantId === null))
export const CustomerAdoptionSourceSchema = z
  .object({
    scope: Scope,
    owner: z.object({ identityId: Id, accountId: Id, workspaceId: Id }).strict(),
    predecessors: z
      .object({
        previewPolicyDigest: Digest,
        approvalId: Id,
        approvalDigest: Digest,
        entitlementId: Id,
        entitlementDigest: Digest,
        provisioningJobDigest: Digest
      })
      .strict(),
    checkpoint: z
      .object({ id: ReleaseScopedIdSchema, digest: Digest, objectKey: z.string().min(1).max(1024) })
      .strict(),
    siteDigest: Digest,
    storage: CustomerAdoptionStorageProofSchema
  })
  .strict()
export const CustomerAdoptionGrantReferenceSchema = z.object({ grantId: Id, revision: Revision }).strict()
export const CustomerAdoptionSetupRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('resume'), grant: CustomerAdoptionGrantReferenceSchema }).strict(),
  z
    .object({
      operation: z.literal('adoption'),
      grant: CustomerAdoptionGrantReferenceSchema,
      request: CmsAdoptionControlRequestSchema
    })
    .strict()
])
export type CustomerAdoptionSource = z.infer<typeof CustomerAdoptionSourceSchema>
