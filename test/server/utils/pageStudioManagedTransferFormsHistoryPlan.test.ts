import { expect, it } from 'vitest'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { planFormDraftHistoryTransfer, expectedFormDraftHistoryImportReceipt } from '~~/shared/pageStudio/managed-transfer-forms-history-plan'
import { formsHistoryFixture, formsHistoryInventory } from '../../helpers/pageStudio/formsHistory'

const scope = { businessId: 'client_one', clientId: 'client_one', environment: 'staging' as const, siteId: 'site_one', tenantId: 'tenant_one' }
const target = { accountId: 'a'.repeat(32), collectionReceiptDigest: 'b'.repeat(64), databaseId: '10000000-0000-4000-8000-000000000001',
  name: `ps-content-${'a'.repeat(32)}`, routeId: 'source_route', runtimeDigest: 'c'.repeat(64), stagingReceiptDigest: 'd'.repeat(64), workflowReceiptDigest: 'e'.repeat(64) }
const intent = { formatVersion: 1, transferId: '10000000-0000-4000-8000-000000000003', nativeIntentDigest: '1'.repeat(64),
  source: { scope, target, fenceDigest: '2'.repeat(64) }, destination: { scope: { ...scope, environment: 'production' }, target: { ...target,
    databaseId: '10000000-0000-4000-8000-000000000002', name: `ps-content-${'b'.repeat(32)}`, routeId: 'destination_route' } } }
const fixture = (n = 2) => formsHistoryFixture(scope, intent.source.fenceDigest, n)

it('preserves every typed revision, removed identity and provenance while deriving the exact import receipt', async () => {
  const history = await fixture(), original = structuredClone(history)
  const plan = await planFormDraftHistoryTransfer(intent, history)
  expect(plan.entries).toHaveLength(10)
  expect(plan.source.historyDigest).toBe(history.digest)
  for (const [i, entry] of plan.entries.entries()) {
    expect(entry.sourceDigest).toBe(history.entries[i]!.digest)
    expect(JSON.parse(entry.destination.payload)).toEqual({ ...JSON.parse(history.entries[i]!.payload), scope: intent.destination.scope })
  }
  const receipt = await expectedFormDraftHistoryImportReceipt(plan)
  const identity = { destination: plan.destination, formatVersion: 1, nativeIntentDigest: intent.nativeIntentDigest, planDigest: plan.digest,
    source: plan.source, transferId: intent.transferId }
  expect(receipt.importIdentityDigest).toBe(await collectionDigest(identity))
  expect(receipt.destinationHistoryDigest).toBe(await collectionDigest({ formatVersion: 1, fenceDigest: intent.source.fenceDigest,
    counts: history.counts, entries: plan.entries.map(entry => entry.destination) }))
  const { digest, ...body } = receipt
  expect(digest).toBe(await collectionDigest(body))
  expect(history).toEqual(original)
})
it('admits complete empty history and the supported1000 typed revisions', async () => {
  expect((await planFormDraftHistoryTransfer(intent, await fixture(0))).entries).toEqual([])
  expect((await planFormDraftHistoryTransfer(intent, await fixture(200))).entries).toHaveLength(1000)
  await expect(planFormDraftHistoryTransfer(intent, await fixture(201))).rejects.toThrow()
})
it.each(['gap', 'duplicate', 'order', 'scope', 'identity', 'type', 'fence', 'counts', 'digest'])('rejects complete-looking changed %s history', async (field) => {
  let history = await fixture()
  if (field === 'gap') history.entries.splice(0, 1)
  if (field === 'duplicate') history.entries.splice(1, 0, structuredClone(history.entries[0]!))
  if (field === 'order') history.entries.reverse()
  if (['scope', 'identity', 'type'].includes(field)) {
    const record = JSON.parse(history.entries[0]!.payload)
    if (field === 'scope') record.scope.siteId = 'another_site'
    if (field === 'identity') record.formId = 'another_form'
    if (field === 'type') record.settings = { recipients: [], overrides: [] }
    history.entries[0]!.payload = canonical(record)
  }
  history = await formsHistoryInventory(history.entries, history.fenceDigest)
  if (field === 'fence') history.fenceDigest = '0'.repeat(64)
  if (field === 'counts') history.counts.form_settings_drafts++
  if (field === 'digest') history.digest = '0'.repeat(64)
  await expect(planFormDraftHistoryTransfer(intent, history)).rejects.toThrow()
})
it.each(['site', 'database', 'name', 'route'])('rejects substituted destination %s', async (field) => {
  const changed = structuredClone(intent)
  if (field === 'site') changed.destination.scope.siteId = 'other_site'
  if (field === 'database') changed.destination.target.databaseId = target.databaseId
  if (field === 'name') changed.destination.target.name = target.name
  if (field === 'route') changed.destination.target.routeId = target.routeId
  await expect(planFormDraftHistoryTransfer(changed, await fixture())).rejects.toThrow()
})
it('owns the complete bounded input before awaiting any digest', async () => {
  const history = await fixture(), request = structuredClone(intent)
  const pending = planFormDraftHistoryTransfer(request, history)
  request.destination.scope.siteId = 'mutated_site'
  history.entries[0]!.payload = '{}'
  const plan = await pending
  expect(plan.destination.scope.siteId).toBe(scope.siteId)
  expect(JSON.parse(plan.entries[0]!.destination.payload).formId).toBe('removed_form')
})

async function sizedEmailHistory(sizes: number[]) {
  const base = (await fixture(1)).entries.find(entry => entry.table === 'email_template_drafts')!
  const entries = sizes.map((size, index) => {
    const record = JSON.parse(base.payload)
    record.revision = index + 1
    record.template.blocks = Array.from({ length: 22 }, (_, i) => ({ id: `block_${i}`, type: 'text', text: '界'.repeat(7000) }))
    let missing = size - new TextEncoder().encode(canonical(record)).byteLength
    for (const block of record.template.blocks) {
      const count = Math.min(Math.floor(missing / 3), 8000 - block.text.length)
      block.text += '界'.repeat(count)
      missing -= count * 3
    }
    for (const block of record.template.blocks) {
      const count = Math.min(missing, 8000 - block.text.length)
      block.text += 'x'.repeat(count)
      missing -= count
    }
    expect(missing).toBe(0)
    return { ...base, revision: index + 1, payload: canonical(record) }
  })
  return formsHistoryInventory(entries, intent.source.fenceDigest)
}
it('enforces UTF8 bytes for source and environment-expanded destination rows', async () => {
  const within = await sizedEmailHistory([524285])
  expect((await planFormDraftHistoryTransfer(intent, within)).entries).toHaveLength(1)
  await expect(planFormDraftHistoryTransfer(intent, await sizedEmailHistory([524289]))).rejects.toThrow()
  await expect(planFormDraftHistoryTransfer(intent, await sizedEmailHistory([524286]))).rejects.toThrow()
})
it('enforces independent aggregate source and destination eight MiB limits', async () => {
  expect((await planFormDraftHistoryTransfer(intent, await sizedEmailHistory(Array(17).fill(490000)))).entries).toHaveLength(17)
  await expect(planFormDraftHistoryTransfer(intent, await sizedEmailHistory(Array(17).fill(500000)))).rejects.toThrow()
  // Source is 8,388,599 bytes; staging→production adds three bytes per row.
  await expect(planFormDraftHistoryTransfer(intent, await sizedEmailHistory(Array(17).fill(493447)))).rejects.toThrow()
})
