import { describe, expect, it, vi } from 'vitest'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { completionReceiptFixture } from '../../helpers/pageStudio/managedTransferCompletion'
import { retainedManagedTransferCompletion, readCurrentManagedTransferCompletion } from '~~/server/utils/pageStudio/managedTransferCompletionRead'

const key = (scope: { tenantId: string, clientId: string, businessId: string, siteId: string, environment: string }) => JSON.stringify([scope.tenantId, scope.clientId, scope.businessId, scope.siteId, scope.environment])
async function setup() {
  const receipt = await completionReceiptFixture()
  const state = (endpoint: typeof receipt.source) => ({ scope_key: key(endpoint.scope), state: endpoint.scope.environment === 'staging' ? 'retained' : 'managed',
    target: endpoint.target, freeze_digest: endpoint.freezeDigest, active_generation: endpoint.generation, current_application_id: endpoint.application.id,
    current_content_id: endpoint.contentId, transfer_id: endpoint.scope.environment === 'production' ? receipt.operationId : null,
    retained_by_transfer_id: endpoint.scope.environment === 'staging' ? receipt.operationId : null })
  const intent = { operationId: receipt.operationId, authority: { source: receipt.source.scope, destination: receipt.destination.scope },
    source: { context: { state: state(receipt.source), application: { id: receipt.source.application.id, digest: receipt.source.application.digest } }, checkpoint: receipt.source.checkpoint },
    destination: { generation: receipt.destination.generation } }
  receipt.intentDigest = await collectionDigest(intent)
  const { digest: _, ...body } = receipt
  receipt.digest = await collectionDigest(body)
  const row = { operation_id: receipt.operationId, intent_digest: receipt.intentDigest, receipt, receipt_json: canonical(receipt), receipt_digest: receipt.digest,
    audit_id: receipt.auditId, copy_proof_digest: receipt.copyProofDigest, history_receipt_digest: receipt.historyReceiptDigest,
    source_scope_key: key(receipt.source.scope), source_generation: receipt.source.generation, destination_scope_key: key(receipt.destination.scope), destination_generation: receipt.destination.generation,
    copy_intent_digest: receipt.intentDigest, verified_copy_digest: receipt.copyProofDigest, history_intent_digest: receipt.intentDigest, verified_history_digest: receipt.historyReceiptDigest,
    source: state(receipt.source), destination: state(receipt.destination) }
  const query = vi.fn().mockImplementation(async (sql: string) => ({ rows: sql.includes('managed_transfer_completions') ? [row] : [{ environment: 'production', state: 'managed' }] }))
  return { receipt, row, intent, db: { query }, read: () => retainedManagedTransferCompletion({ query }, intent as never) }
}
describe('retained terminal handoff identity', () => {
  it('returns only the original immutable receipt while current destination drafts can advance', async () => {
    const c = await setup()
    c.row.destination.current_application_id = '00000000-0000-4000-8000-000000000099'
    expect(await c.read()).toEqual(c.receipt)
  })
  it('returns null before any completion has been committed', async () => {
    const c = await setup()
    c.db.query.mockResolvedValue({ rows: [] })
    expect(await c.read()).toBeNull()
  })
  it.each(['receipt_json', 'intent_digest', 'copy_proof_digest', 'verified_copy_digest', 'verified_history_digest', 'audit_id', 'source_generation', 'destination_scope_key'])('rejects mismatched native %s association', async (field) => {
    const c = await setup()
    Object.assign(c.row, { [field]: 'forged' })
    await expect(c.read()).rejects.toThrow()
  })
  it.each(['transfer', 'generation', 'target', 'source-state', 'source-content', 'source-app', 'destination-state'])('rejects changed current %s', async (field) => {
    const c = await setup()
    if (field === 'transfer') c.row.destination.transfer_id = null
    if (field === 'generation') c.row.destination.active_generation = c.receipt.source.generation
    if (field === 'target') c.row.destination.target = c.receipt.source.target
    if (field === 'source-state') c.row.source.state = 'managed'
    if (field === 'source-content') c.row.source.current_content_id = c.receipt.destination.contentId
    if (field === 'source-app') c.row.source.current_application_id = c.receipt.destination.application.id
    if (field === 'destination-state') c.row.destination.state = 'blocked'
    await expect(c.read()).rejects.toThrow()
  })
})

describe('current authoring completion provenance', () => {
  async function current() {
    const c = await setup()
    c.db.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT intent.intent')
      ? [{ intent: c.intent, intent_digest: c.receipt.intentDigest }]
      : sql.includes('managed_transfer_completions') ? [c.row] : [{ environment: 'production', state: 'managed' }] }))
    return { ...c, readCurrent: () => readCurrentManagedTransferCompletion(c.db, c.receipt.destination.scope as never) }
  }
  it('validates current selection without consulting the original owner or operator login', async () => {
    const c = await current()
    c.row.destination.current_application_id = '00000000-0000-4000-8000-000000000099'
    expect(await c.readCurrent()).toEqual(c.receipt)
    expect(c.db.query.mock.calls.every(([sql]) => !/customer_sessions|login_sessions/.test(sql))).toBe(true)
  })
  it('returns null when the site has no completed transfer', async () => {
    const c = await current()
    c.db.query.mockResolvedValue({ rows: [] })
    expect(await c.readCurrent()).toBeNull()
  })
  it.each(['scope', 'intent', 'selection'])('rejects changed %s despite a retained completion', async (field) => {
    const c = await current()
    if (field === 'scope') c.receipt.destination.scope.siteId = '00000000-0000-4000-8000-000000000099'
    if (field === 'intent') c.intent.destination.generation = '00000000-0000-4000-8000-000000000099'
    if (field === 'selection') c.row.destination.transfer_id = null
    await expect(c.readCurrent()).rejects.toThrow()
  })
  it('rejects nonproduction scope', async () => {
    const c = await current()
    await expect(readCurrentManagedTransferCompletion(c.db, c.receipt.source.scope as never)).rejects.toThrow()
  })
})
