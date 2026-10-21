import fixture from '../../fixtures/pageStudioManagedTransferDestinationAuthoring.json'
import type { TransferAuthority } from '../../../shared/pageStudio/managedTransferAuthorityTransport'

const reference = { operationId: fixture.request.operationId, intentDigest: fixture.request.intentDigest }
const source = fixture.historyRequest.sourceRequest.fenceIntent
const predecessor = { accountId: source.target.accountId, compatibilityDate: '2026-08-18', databaseId: source.target.databaseId,
  namespace: 'xeroflow-page-studio-dispatch-staging', ownerTag: `ps-owner-${'1'.repeat(32)}`, runtimeDigest: source.target.runtimeDigest,
  scope: source.scope, scriptName: `ps-content-${'1'.repeat(32)}`, setupDigest: '1'.repeat(64) }
export const execution = { formatVersion: 1, ...reference, sourceScope: source.scope, sourceTarget: source.target,
  freeze: { digest: '2'.repeat(64), createdAt: '2026-10-21T00:00:00.000Z', state: 'frozen', request: { formatVersion: 1, actor: { kind: 'agency-user', userId: reference.operationId, loginSessionHash: '1'.repeat(64) }, adoptionId: 'adoption_a', scope: source.scope, target: source.target } },
  formReceipt: { operationId: 'forms_a', collectionOperationId: 'collection_a', workflowOperationId: 'workflow_a', stagingOperationId: 'staging_a',
    scope: source.scope, accountId: source.target.accountId, databaseId: source.target.databaseId, name: source.target.name,
    sourceDigest: '863be4f1fa6709c12fcdc8be3c5432c754dcdc535995f31042613e8072571e0e', targetDigest: 'c4f79d0a585c725b72fd8f85ad52ed0494268b7d57853965a673149170b033b2' },
  predecessor, successor: { ...predecessor, runtimeDigest: '8'.repeat(64), ownerTag: `ps-owner-${'2'.repeat(32)}`, scriptName: `ps-content-${'2'.repeat(32)}` },
  policy: { version: 1, kind: 'managed-draft-transfer', formReceiptDigest: '3'.repeat(64), from: { compatibilityDate: predecessor.compatibilityDate, digest: predecessor.runtimeDigest }, to: { compatibilityDate: predecessor.compatibilityDate, digest: '8'.repeat(64) } } }
export const context = { formatVersion: 1, ...reference, sourceScope: source.scope, sourceTarget: source.target, freezeDigest: '2'.repeat(64) }
export const authorityInputs: Record<TransferAuthority, unknown> = {
  'execution/context': reference,
  'execution/authorize': execution,
  'source-drafts/authorize': { action: 'read', request: fixture.historyRequest.sourceRequest },
  'destination-catalogue/authorize': { action: 'prepare', request: fixture.request.destinationRequest.catalogueRequest },
  'destination-execution/authorize': { action: 'prepare', request: fixture.request.destinationRequest },
  'copy-graph/authorize': { ...reference, action: 'inspect', requestDigest: '1'.repeat(64), contextDigest: '2'.repeat(64) },
  'forms-history/authorize': { action: 'prepare', request: fixture.historyRequest },
  'destination-authoring/authorize': { action: 'install', request: fixture.request },
  'source-retention/authorize': { action: 'retain', request: { formatVersion: 1, ...reference, sourceRequest: fixture.historyRequest.sourceRequest, completion: fixture.request.completionReceipt } }
}
export const authorityEnv = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONER: { createProvisioning: async () => null, readProvisioning: async () => null } }
