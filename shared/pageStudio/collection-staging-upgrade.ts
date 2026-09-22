import { z } from 'zod'
import { WorkflowUpgradeOperationSchema } from './workflow-upgrade'

export const CollectionStagingUpgradeOperationSchema = WorkflowUpgradeOperationSchema.extend({
  policyVersion: z.literal('collection-staging-upgrade-v1'),
  sourceDigest: z.literal('60631223175cb7e8bf9dca5b08347a192844b8600bd8687e1caa8b60c9f337ae'),
  targetDigest: z.literal('863be4f1fa6709c12fcdc8be3c5432c754dcdc535995f31042613e8072571e0e'),
  workflowOperationId: WorkflowUpgradeOperationSchema.shape.operationId
}).strict()
export type CollectionStagingUpgradeOperation = z.infer<
  typeof CollectionStagingUpgradeOperationSchema
>
export const CollectionStagingUpgradeDatabaseSchema = CollectionStagingUpgradeOperationSchema.pick({
  accountId: true,
  collectionOperationId: true,
  workflowOperationId: true,
  databaseId: true,
  name: true,
  scope: true
})
function canonical(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`
}
export async function collectionStagingUpgradeIdentity(input: unknown) {
  const request = CollectionStagingUpgradeOperationSchema.parse(input)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(request)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
