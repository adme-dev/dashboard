import { collectionCanonical } from './collectionApi'
import { z } from 'zod'
import { CollectionStagingUpgradeOperationSchema } from './collection-staging-upgrade'

// Fixed reviewed catalogue identity; native authority and provider verification
// remain independent requirements. These definitions preserve the private v1 bytes.
const StagingReceipt = CollectionStagingUpgradeOperationSchema.omit({ actor: true, policyVersion: true, version: true })
export const FormDraftsUpgradeIntentSchema = StagingReceipt.omit({ sourceDigest: true, targetDigest: true }).extend({ stagingOperationId: StagingReceipt.shape.operationId }).strict()
export const FormDraftsUpgradeReceiptSchema = FormDraftsUpgradeIntentSchema.extend({
  sourceDigest: z.literal('863be4f1fa6709c12fcdc8be3c5432c754dcdc535995f31042613e8072571e0e'),
  targetDigest: z.literal('c4f79d0a585c725b72fd8f85ad52ed0494268b7d57853965a673149170b033b2')
}).strict()
export const FormDraftsUpgradeOperationSchema = FormDraftsUpgradeReceiptSchema.extend({
  actor: CollectionStagingUpgradeOperationSchema.shape.actor,
  policyVersion: z.literal('form-drafts-upgrade-v1'),
  runtime: z.object({
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    etag: z.string().min(1).max(200),
    successorIdentity: z.string().regex(/^[a-f0-9]{64}$/)
  }).strict(),
  version: z.literal(1)
}).strict()
export const FormDraftsRuntimeRequestSchema = FormDraftsUpgradeOperationSchema.omit({ runtime: true })
export const FormDraftsRuntimeReceiptSchema = FormDraftsUpgradeReceiptSchema.extend({ runtimeKind: z.literal('form-drafts-v1') }).strict()
export const FormDraftsRuntimeDatabaseSchema = FormDraftsRuntimeRequestSchema.pick({
  scope: true, accountId: true, databaseId: true, name: true,
  collectionOperationId: true, workflowOperationId: true, stagingOperationId: true
})
export const FormDraftsUpgradeDatabaseSchema = FormDraftsRuntimeDatabaseSchema.extend({ runtime: FormDraftsUpgradeOperationSchema.shape.runtime }).strict()
export type FormDraftsUpgradeOperation = z.infer<typeof FormDraftsUpgradeOperationSchema>
export type FormDraftsRuntimeRequest = z.infer<typeof FormDraftsRuntimeRequestSchema>

async function identity(request: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(collectionCanonical(request)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
export const formDraftsUpgradeIdentity = (input: unknown) => identity(FormDraftsUpgradeOperationSchema.parse(input))
export const formDraftsRuntimeIdentity = (input: unknown) => identity(FormDraftsRuntimeRequestSchema.parse(input))
