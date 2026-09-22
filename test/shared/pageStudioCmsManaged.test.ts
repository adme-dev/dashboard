// Golden contract cases shared with Studio cms-managed.test.ts at 6697b71.
import { describe, expect, it } from 'vitest'
import {
  CmsFreezeRequestSchema,
  CmsObjectPinSchema,
  CmsPreparationSchema
} from '~~/shared/pageStudio/cmsManaged'

const scope = {
  businessId: 'business_a',
  clientId: 'client_a',
  environment: 'staging',
  siteId: 'site_a',
  tenantId: 'tenant_a'
}
const actor = {
  kind: 'agency-user',
  loginSessionHash: 'a'.repeat(64),
  userId: '10000000-0000-4000-8000-000000000001'
}
const target = {
  accountId: 'a'.repeat(32),
  collectionReceiptDigest: 'b'.repeat(64),
  databaseId: '20000000-0000-4000-8000-000000000001',
  name: `ps-content-${'b'.repeat(32)}`,
  routeId: 'route_a',
  runtimeDigest: 'a'.repeat(64),
  stagingReceiptDigest: 'd'.repeat(64),
  workflowReceiptDigest: 'c'.repeat(64)
}
const pin = {
  bytes: 100,
  collectionId: '',
  freezeDigest: 'a'.repeat(64),
  kind: 'content',
  operationId: 'adoption_a',
  origin: 'legacy',
  recordId: '',
  sha256: 'b'.repeat(64),
  version: 1
}
describe('private managed CMS contracts', () => {
  it('binds strict freeze identity without granting managed activation', () => {
    const request = {
      actor,
      adoptionId: 'adoption_a',
      formatVersion: 1,
      scope,
      target
    }
    expect(CmsFreezeRequestSchema.parse(request)).toEqual(request)
    expect(() => CmsFreezeRequestSchema.parse({ ...request, managed: true })).toThrow()
  })
  it('requires an exact storage incarnation and kind-specific logical identity', () => {
    expect(CmsObjectPinSchema.parse(pin)).toEqual(pin)
    for (const extra of [
      { kind: 'record' },
      { kind: 'schema' },
      { origin: 'latest' },
      { version: 0 },
      { freezeDigest: 'bad' },
      { collectionId: 'foreign' }
    ]) {
      expect(() => CmsObjectPinSchema.parse({ ...pin, ...extra })).toThrow()
    }
  })
  it('bounds complete preparations and rejects injected authority', () => {
    const item = {
      body: { collections: [], schemaVersion: 1, scope },
      expectedBase: null,
      kind: 'content',
      version: 1
    }
    const request = {
      action: null,
      actor,
      candidateDigest: null,
      formatVersion: 1,
      freezeDigest: 'a'.repeat(64),
      items: [item],
      operationId: 'prepare_a',
      scope
    }
    expect(CmsPreparationSchema.parse(request)).toEqual(request)
    expect(() => CmsPreparationSchema.parse({ ...request, items: [] })).toThrow()
    expect(() =>
      CmsPreparationSchema.parse({
        ...request,
        items: Array.from({ length: 33 }, () => item)
      })
    ).toThrow()
    expect(() => CmsPreparationSchema.parse({ ...request, accepted: true })).toThrow()
    expect(() => CmsPreparationSchema.parse({ ...request, items: [item, item] })).toThrow()
    expect(() =>
      CmsPreparationSchema.parse({
        ...request,
        items: [{ ...item, version: 2 }]
      })
    ).toThrow()
  })
})
