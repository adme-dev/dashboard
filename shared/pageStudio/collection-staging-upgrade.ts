import { collectionDigest } from './collectionApi'
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
export async function collectionStagingUpgradeIdentity(input: unknown) {
  return collectionDigest(CollectionStagingUpgradeOperationSchema.parse(input))
}
