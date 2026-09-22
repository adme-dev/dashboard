import { describe, expect, it } from 'vitest'
import {
  CmsFreezeRequestSchema,
  CmsObjectPinSchema,
  CmsPreparationSchema,
  cmsPreparationActorId
} from '../../../shared/pageStudio/cmsManaged'

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
    expect(() =>
      CmsFreezeRequestSchema.parse({ ...request, managed: true })
    ).toThrow()
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
    expect(() =>
      CmsPreparationSchema.parse({ ...request, items: [] })
    ).toThrow()
    expect(() =>
      CmsPreparationSchema.parse({
        ...request,
        items: Array.from({ length: 33 }, () => item)
      })
    ).toThrow()
    expect(() =>
      CmsPreparationSchema.parse({ ...request, accepted: true })
    ).toThrow()
    expect(() =>
      CmsPreparationSchema.parse({ ...request, items: [item, item] })
    ).toThrow()
    expect(() =>
      CmsPreparationSchema.parse({
        ...request,
        items: [{ ...item, version: 2 }]
      })
    ).toThrow()
  })
})

const publishedActor = {
  activationId: '10000000-0000-4000-8000-000000000003',
  identityDigest: 'c'.repeat(64),
  invocationId: '10000000-0000-4000-8000-000000000002',
  kind: 'published-form',
  pointerVersion: 1,
  releaseId: '10000000-0000-4000-8000-000000000004'
}
function publicPreparation() {
  return {
    action: {
      id: 'submit_record',
      kind: 'action',
      sha256: 'd'.repeat(64),
      version: 1
    },
    actor: publishedActor,
    candidateDigest: null,
    formatVersion: 2,
    freezeDigest: pin.freezeDigest,
    items: [
      {
        body: {
          archived: false,
          collectionId: 'entries',
          id: 'entry_a',
          revision: 1,
          schemaVersion: 1,
          scope,
          values: { title: 'Hello' }
        },
        expectedBase: null,
        kind: 'record',
        schema: { ...pin, collectionId: 'entries', kind: 'schema' },
        version: 1
      }
    ],
    operationId: 'public_prepare',
    scope
  }
}
it('retains explicit public provenance without minting a human identity or freeze', () => {
  const request = publicPreparation()
  expect(CmsPreparationSchema.parse(request)).toEqual(request)
  expect(cmsPreparationActorId(request.actor)).toBe(
    `published:${publishedActor.invocationId}`
  )
  expect(cmsPreparationActorId(actor)).toBe(actor.userId)
  expect(() =>
    cmsPreparationActorId({ ...publishedActor, userId: actor.userId })
  ).toThrow()
  expect(() =>
    CmsFreezeRequestSchema.parse({
      actor: publishedActor,
      adoptionId: 'adopt',
      formatVersion: 1,
      scope,
      target
    })
  ).toThrow()
})
it.each([
  ['human', (r: ReturnType<typeof publicPreparation>) => ({ ...r, actor })],
  [
    'v1',
    (r: ReturnType<typeof publicPreparation>) => ({ ...r, formatVersion: 1 })
  ],
  [
    'action',
    (r: ReturnType<typeof publicPreparation>) => ({ ...r, action: null })
  ],
  [
    'candidate',
    (r: ReturnType<typeof publicPreparation>) => ({
      ...r,
      candidateDigest: 'e'.repeat(64)
    })
  ],
  [
    'update',
    (r: ReturnType<typeof publicPreparation>) => ({
      ...r,
      items: [
        {
          ...r.items[0],
          body: { ...r.items[0].body, revision: 2 },
          expectedBase: {
            ...pin,
            collectionId: 'entries',
            kind: 'record',
            recordId: 'entry_a'
          },
          version: 2
        }
      ]
    })
  ],
  [
    'archive',
    (r: ReturnType<typeof publicPreparation>) => ({
      ...r,
      items: [{ ...r.items[0], body: { ...r.items[0].body, archived: true } }]
    })
  ],
  [
    'schema',
    (r: ReturnType<typeof publicPreparation>) => ({
      ...r,
      items: [{ expectedBase: null, kind: 'schema', version: 1, body: {
        displayFieldId: 'title', fields: [{ id: 'title', label: 'Title', required: true, type: 'text', visibility: 'public' }],
        formatVersion: 1, id: 'entries', label: 'Entries', scope, version: 1
      } }]
    })
  ],
  [
    'content',
    (r: ReturnType<typeof publicPreparation>) => ({
      ...r,
      items: [
        {
          body: { collections: [], schemaVersion: 1, scope },
          expectedBase: null,
          kind: 'content',
          version: 1
        }
      ]
    })
  ],
  [
    'actor-extra',
    (r: ReturnType<typeof publicPreparation>) => ({
      ...r,
      actor: { ...r.actor, loginSessionHash: actor.loginSessionHash }
    })
  ],
  [
    'epoch',
    (r: ReturnType<typeof publicPreparation>) => ({
      ...r,
      actor: { ...r.actor, pointerVersion: 0 }
    })
  ],
  [
    'scope',
    (r: ReturnType<typeof publicPreparation>) => ({
      ...r,
      items: [
        {
          ...r.items[0],
          body: {
            ...r.items[0].body,
            scope: { ...scope, siteId: 'other_site' }
          }
        }
      ]
    })
  ]
] as const)('rejects public %s preparation', (_kind, change) => {
  expect(() =>
    CmsPreparationSchema.parse(change(publicPreparation()))
  ).toThrow()
})

it('keeps the human wire variant exact while separating public authority-shaped data', () => {
  const publicRequest = publicPreparation()
  const human = { ...publicRequest, actor, formatVersion: 1 }
  expect(CmsPreparationSchema.parse(human)).toEqual(human)
  expect(() => CmsPreparationSchema.parse({ ...publicRequest, actor })).toThrow()
  expect(() => CmsPreparationSchema.parse({ ...publicRequest, actor: { ...publishedActor, userId: actor.userId } })).toThrow()
  expect(() => cmsPreparationActorId({ ...publishedActor, invocationId: 'invalid' })).toThrow()
})
