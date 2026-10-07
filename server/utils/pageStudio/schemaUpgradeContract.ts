import { FormDraftsUpgradeOperationSchema, FormDraftsUpgradeDatabaseSchema, FormDraftsUpgradeReceiptSchema, FormDraftsRuntimeRequestSchema, FormDraftsRuntimeDatabaseSchema, FormDraftsRuntimeReceiptSchema, formDraftsUpgradeIdentity, formDraftsRuntimeIdentity } from '~~/shared/pageStudio/form-drafts-upgrade'

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
  expectedReceipt(input: unknown) {
    const { actor: _actor, version: _version, policyVersion: _policy, ...receipt } = CollectionUpgradeOperationSchema.parse(input)
    return CollectionUpgradeOperationSchema.omit({ actor: true, version: true, policyVersion: true }).parse(receipt)
  },
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
  expectedReceipt(input: unknown) {
    const { actor: _actor, version: _version, policyVersion: _policy, ...receipt } = WorkflowUpgradeOperationSchema.parse(input)
    return WorkflowUpgradeOperationSchema.omit({ actor: true, version: true, policyVersion: true }).parse(receipt)
  },
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
  expectedReceipt(input: unknown) {
    const { actor: _actor, version: _version, policyVersion: _policy, ...receipt } = CollectionStagingUpgradeOperationSchema.parse(input)
    return CollectionStagingUpgradeOperationSchema.omit({ actor: true, version: true, policyVersion: true }).parse(receipt)
  },
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
// Separate native records: completing runtime setup is not storage installation.
export const formDraftsRuntimeContract = {
  kind: 'form-runtime', label: 'Form runtime', idempotencyPrefix: 'cms.form-runtime',
  schema: FormDraftsRuntimeRequestSchema, databaseSchema: FormDraftsRuntimeDatabaseSchema,
  receiptSchema: FormDraftsRuntimeReceiptSchema,
  expectedReceipt(input: unknown) {
    const { actor: _actor, version: _version, policyVersion: _policy, ...receipt } = FormDraftsRuntimeRequestSchema.parse(input)
    return FormDraftsRuntimeReceiptSchema.parse({ ...receipt, runtimeKind: 'form-drafts-v1' })
  },
  identity: formDraftsRuntimeIdentity,
  discoveryMethod: 'readFormDraftsRuntimeDatabase', executeMethod: 'executeFormDraftsRuntime', statusMethod: 'readFormDraftsRuntimeOperation',
  loginMessage: 'Sign in again before preparing form runtime', discoveryMessage: 'Form runtime predecessor discovery is unavailable',
  pendingCode: 'FORM_RUNTIME_SETUP_PENDING', pendingMessage: 'Form runtime preparation is pending.'
} as const
export const formDraftsUpgradeContract = {
  kind: 'form-drafts', label: 'Form drafts', idempotencyPrefix: 'cms.form-drafts',
  schema: FormDraftsUpgradeOperationSchema, databaseSchema: FormDraftsUpgradeDatabaseSchema,
  receiptSchema: FormDraftsUpgradeReceiptSchema,
  expectedReceipt(input: unknown) {
    // Runtime remains part of the native identity, never the physical receipt.
    const { actor: _actor, version: _version, policyVersion: _policy, runtime: _runtime, ...receipt } = FormDraftsUpgradeOperationSchema.parse(input)
    return FormDraftsUpgradeReceiptSchema.parse(receipt)
  },
  identity: formDraftsUpgradeIdentity,
  discoveryMethod: 'readFormDraftsUpgradeDatabase', executeMethod: 'executeFormDraftsUpgrade', statusMethod: 'readFormDraftsUpgradeOperation',
  loginMessage: 'Sign in again before preparing form drafts', discoveryMessage: 'Form draft predecessor discovery is unavailable',
  pendingCode: 'FORM_DRAFTS_SETUP_PENDING', pendingMessage: 'Form draft preparation is pending.'
} as const
export type SchemaUpgradeContract
  = | typeof formDraftsRuntimeContract
    | typeof formDraftsUpgradeContract
    | typeof collectionStagingUpgradeContract
    | typeof collectionUpgradeContract
    | typeof workflowUpgradeContract
