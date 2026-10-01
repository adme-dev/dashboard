import { describe, expect, it } from 'vitest'
import * as contracts from '~~/server/utils/pageStudio/schemaUpgradeContract'
import { CustomerSchemaUpgradeRequestSchema } from '~~/shared/pageStudio/customerSchemaUpgrade'
import fixture from './fixtures/form-drafts-upgrade-v1.json'

const names = ['formDraftsRuntimeContract', 'formDraftsUpgradeContract'] as const
const runtimeRequest = () => {
  const { runtime, ...request } = fixture.intent
  return request
}
describe('native form setup contracts', () => {
  it.each(['form-runtime', 'form-drafts'])('admits only narrow browser requests for %s', (kind) => {
    const request = { action: 'start', kind, requestId: crypto.randomUUID() }
    expect(CustomerSchemaUpgradeRequestSchema.safeParse(request).success).toBe(true)
    for (const field of ['scope', 'actor', 'runtime', 'databaseId', 'stagingOperationId']) expect(CustomerSchemaUpgradeRequestSchema.safeParse({ ...request, [field]: 'forged' }).success).toBe(false)
  })
  it('defines separate strict forms and runtime receipts with full pinned operation identity', async () => {
    const runtime = contracts[names[0]], forms = contracts[names[1]]
    expect(runtime).toBeDefined()
    expect(forms).toBeDefined()
    expect(await forms.identity(fixture.intent)).toBe(fixture.identity)
    expect(await forms.identity({ ...fixture.intent, runtime: { ...fixture.intent.runtime, etag: 'changed' } })).not.toBe(fixture.identity)
    const physical = forms.expectedReceipt(fixture.intent), completed = runtime.expectedReceipt(runtimeRequest())
    expect(physical).not.toHaveProperty('runtime')
    expect(physical).not.toHaveProperty('actor')
    expect(completed).toEqual({ ...physical, runtimeKind: 'form-drafts-v1' })
    expect(forms.receiptSchema.safeParse(completed).success).toBe(false)
    expect(runtime.receiptSchema.safeParse(physical).success).toBe(false)
    expect(forms.schema.safeParse(runtimeRequest()).success).toBe(false)
    expect(runtime.schema.safeParse(fixture.intent).success).toBe(false)
    for (const field of ['digest', 'etag', 'successorIdentity']) expect(forms.schema.safeParse({ ...fixture.intent, runtime: { ...fixture.intent.runtime, [field]: '' } }).success).toBe(false)
    const discovery = {
      accountId: fixture.intent.accountId, databaseId: fixture.intent.databaseId,
      name: fixture.intent.name, scope: fixture.intent.scope,
      collectionOperationId: fixture.intent.collectionOperationId,
      workflowOperationId: fixture.intent.workflowOperationId,
      stagingOperationId: fixture.intent.stagingOperationId, runtime: fixture.intent.runtime
    }
    expect(forms.databaseSchema.parse(discovery)).toEqual(discovery)
    for (const field of ['collectionOperationId', 'workflowOperationId', 'stagingOperationId']) {
      expect(forms.databaseSchema.safeParse({ ...discovery, [field]: undefined }).success).toBe(false)
    }
  })
})
