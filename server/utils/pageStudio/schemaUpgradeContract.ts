import {
  CollectionStagingUpgradeOperationSchema,
  CollectionStagingUpgradeDatabaseSchema,
  collectionStagingUpgradeIdentity
} from '~~/shared/pageStudio/collection-staging-upgrade'
import {
  CollectionUpgradeOperationSchema,
  CollectionUpgradeDatabaseSchema,
  collectionUpgradeIdentity
} from '~~/shared/pageStudio/collection-upgrade'
import {
  WorkflowUpgradeOperationSchema,
  WorkflowUpgradeDatabaseSchema,
  workflowUpgradeIdentity
} from '~~/shared/pageStudio/workflow-upgrade'

// Server-owned configuration only. Separate strict schemas and audit actions
// preserve the independently authorized collection and workflow grants.
export const collectionUpgradeContract = {
  kind: 'collection',
  label: 'Collection',
  idempotencyPrefix: 'cms.collections',
  schema: CollectionUpgradeOperationSchema,
  databaseSchema: CollectionUpgradeDatabaseSchema,
  receiptSchema: CollectionUpgradeOperationSchema.omit({
    actor: true,
    version: true,
    policyVersion: true
  }),
  identity: collectionUpgradeIdentity,
  discoveryMethod: 'readCollectionUpgradeDatabase',
  executeMethod: 'executeCollectionUpgrade',
  statusMethod: 'readCollectionUpgradeOperation',
  loginMessage: 'Sign in again before changing collection schemas',
  discoveryMessage: 'Collection database discovery is unavailable',
  pendingCode: 'COLLECTION_SETUP_PENDING',
  pendingMessage:
    'Custom collection setup is pending. A reviewed website runtime must be configured before setup can complete.'
} as const
export const workflowUpgradeContract = {
  kind: 'workflow',
  label: 'Workflow',
  idempotencyPrefix: 'cms.workflows',
  schema: WorkflowUpgradeOperationSchema,
  databaseSchema: WorkflowUpgradeDatabaseSchema,
  receiptSchema: WorkflowUpgradeOperationSchema.omit({
    actor: true,
    version: true,
    policyVersion: true
  }),
  identity: workflowUpgradeIdentity,
  discoveryMethod: 'readWorkflowUpgradeDatabase',
  executeMethod: 'executeWorkflowUpgrade',
  statusMethod: 'readWorkflowUpgradeOperation',
  loginMessage: 'Sign in again before setting up workflows',
  discoveryMessage: 'Workflow predecessor discovery is unavailable',
  pendingCode: 'WORKFLOW_SETUP_PENDING',
  pendingMessage:
    'Workflow setup is pending. A reviewed website runtime must be configured before setup can complete.'
} as const
export const collectionStagingUpgradeContract = {
  kind: 'collection-staging',
  label: 'CMS staging',
  idempotencyPrefix: 'cms.collection-staging',
  schema: CollectionStagingUpgradeOperationSchema,
  databaseSchema: CollectionStagingUpgradeDatabaseSchema,
  receiptSchema: CollectionStagingUpgradeOperationSchema.omit({
    actor: true,
    version: true,
    policyVersion: true
  }),
  identity: collectionStagingUpgradeIdentity,
  discoveryMethod: 'readCollectionStagingUpgradeDatabase',
  executeMethod: 'executeCollectionStagingUpgrade',
  statusMethod: 'readCollectionStagingUpgradeOperation',
  loginMessage: 'Sign in again before preparing CMS storage',
  discoveryMessage: 'CMS staging predecessor discovery is unavailable',
  pendingCode: 'COLLECTION_STAGING_SETUP_PENDING',
  pendingMessage:
    'CMS preparation is pending. A reviewed website runtime must be configured before setup can complete.'
} as const
export type SchemaUpgradeContract
  = | typeof collectionStagingUpgradeContract
    | typeof collectionUpgradeContract
    | typeof workflowUpgradeContract
