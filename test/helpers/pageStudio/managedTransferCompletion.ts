import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export async function completionReceiptFixture() {
  const scope = { tenantId: 'tenant_one', clientId: id(1), businessId: id(1), siteId: id(2), environment: 'staging' }
  const target = { accountId: 'a'.repeat(32), databaseId: id(3), name: `ps-content-${'a'.repeat(32)}`, routeId: 'source_route', runtimeDigest: 'a'.repeat(64),
    collectionReceiptDigest: 'b'.repeat(64), workflowReceiptDigest: 'c'.repeat(64), stagingReceiptDigest: 'd'.repeat(64) }
  const source = { scope, target, generation: id(4), application: { id: id(5), digest: '1'.repeat(64) },
    checkpoint: { id: 'source_checkpoint', digest: '2'.repeat(64) }, freezeDigest: '3'.repeat(64), contentId: null }
  const destination = { ...source, scope: { ...scope, environment: 'production' }, generation: id(6),
    application: { id: id(7), digest: '4'.repeat(64) }, checkpoint: { id: 'destination_checkpoint', digest: '5'.repeat(64) },
    target: { ...target, databaseId: id(8), name: `ps-content-${'b'.repeat(32)}`, routeId: 'destination_route' }, freezeDigest: '6'.repeat(64), contentId: id(9) }
  const body = { formatVersion: 1, operationId: id(10), intentDigest: '7'.repeat(64), copyProofDigest: '8'.repeat(64),
    historyReceiptDigest: '9'.repeat(64), source, destination, auditId: id(11), completedAt: '2026-10-16T00:00:00.000Z' }
  return { ...body, digest: await collectionDigest(body) }
}
