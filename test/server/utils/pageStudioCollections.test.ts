import { describe, expect, it, vi } from 'vitest'
import { contentLogin } from '../../fixtures/pageStudioContentLogin'
import { executePageStudioCollection } from '~~/server/utils/pageStudio/collections'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

const siteId = 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020'
const actor = { role: 'client' as const, actorId: 'user_test', clientId: 'client_test' }
const scope = {
  tenantId: 'tenant_test',
  clientId: 'client_test',
  businessId: 'client_test',
  siteId,
  environment: 'staging' as const
}
const row = {
  tenant_id: scope.tenantId,
  client_id: scope.clientId,
  site_status: 'active',
  entitlement_status: 'active',
  entitlement_effective: true,
  membership_role: 'editor',
  native_can_view: true,
  native_can_edit: true,
  native_user_role: 'admin',
  plan_metadata: { builder: { collectionSchemas: true } },
  collection_capacity: true,
  portal_creation_enabled: true
}
const definition = {
  formatVersion: 1 as const,
  id: 'fleet',
  label: 'Fleet',
  displayFieldId: 'name',
  version: 1,
  scope,
  fields: [
    { id: 'name', label: 'Name', type: 'text' as const, required: true, visibility: 'public' as const }
  ]
}
async function setup(change = {}) {
  const saved = {
    definition,
    sha256: await collectionDigest(definition),
    actorId: actor.actorId,
    createdAt: '2026-09-21T00:00:00Z'
  }
  const service = {
    readContent: vi.fn(),
    writeContent: vi.fn(),
    listCollectionDefinitions: vi.fn().mockResolvedValue({ items: [saved], nextCursor: null }),
    readCollectionDefinition: vi.fn().mockResolvedValue(saved),
    writeCollectionDefinition: vi.fn().mockResolvedValue(saved),
    listCollectionRecords: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    readCollectionRecord: vi.fn(),
    writeCollectionRecord: vi.fn()
  }
  const request = {
    actor,
    login: contentLogin(actor),
    siteId,
    env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: service }
  }
  const query = vi.fn().mockResolvedValue({ ...row, ...change })
  return { request, query, service, saved }
}
describe('generated collection native admission', () => {
  it.each([
    { native_can_view: false },
    { membership_role: null },
    { entitlement_effective: false },
    { plan_metadata: {} },
    { collection_capacity: false }
  ])('denies before RPC %j', async (change) => {
    const f = await setup(change)
    await expect(
      executePageStudioCollection(f.request, 'listDefinitions', {}, { query: f.query })
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(f.service.listCollectionDefinitions).not.toHaveBeenCalled()
  })
  it('permits viewer reads and reports read-only permissions', async () => {
    const f = await setup({ membership_role: 'viewer' })
    expect(
      await executePageStudioCollection(f.request, 'listDefinitions', {}, { query: f.query })
    ).toMatchObject({ canEdit: false, canManageSchema: false, items: [f.saved] })
  })
  it('withholds a completed read when original login or package changes', async () => {
    const f = await setup()
    f.service.listCollectionDefinitions.mockImplementationOnce(async () => {
      f.query.mockResolvedValue({ ...row, native_can_view: false })
      return { items: [f.saved], nextCursor: null }
    })
    await expect(
      executePageStudioCollection(f.request, 'listDefinitions', {}, { query: f.query })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
  it('denies editor-only portal schema writing and forged authority', async () => {
    const f = await setup({ native_user_role: 'user' })
    const { scope: _scope, ...body } = definition
    await expect(
      executePageStudioCollection(
        f.request,
        'writeDefinition',
        { collectionId: 'fleet', body: { definition: body, expectedVersion: 0 } },
        { query: f.query }
      )
    ).rejects.toMatchObject({ statusCode: 403 })
    const g = await setup()
    await expect(
      executePageStudioCollection(
        g.request,
        'writeRecord',
        {
          collectionId: 'fleet',
          recordId: 'car',
          body: {
            actorId: 'forged',
            expectedRevision: 0,
            schemaVersion: 1,
            archived: false,
            values: { name: 'Car' }
          }
        },
        { query: g.query }
      )
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(g.service.writeCollectionRecord).not.toHaveBeenCalled()
  })
  it('derives actor, scope and digest before a schema write', async () => {
    const f = await setup()
    const { scope: _scope, ...body } = definition
    await executePageStudioCollection(
      f.request,
      'writeDefinition',
      { collectionId: 'fleet', body: { definition: body, expectedVersion: 0 } },
      { query: f.query }
    )
    expect(f.service.writeCollectionDefinition).toHaveBeenCalledWith({
      actorId: actor.actorId,
      definition,
      sha256: f.saved.sha256,
      expectedVersion: 0
    })
  })
  it('writes only server-derived scope and actor and appends archived revisions', async () => {
    const f = await setup()
    const body = { expectedRevision: 2, schemaVersion: 1, archived: true, values: { name: 'Car' } }
    const record = { scope, collectionId: 'fleet', id: 'car', schemaVersion: 1, revision: 3, archived: true, values: body.values }
    f.service.writeCollectionRecord.mockResolvedValueOnce({ record, actorId: actor.actorId, createdAt: '2026-09-21', sha256: await collectionDigest(record) })
    await expect(executePageStudioCollection(f.request, 'writeRecord', { collectionId: 'fleet', recordId: 'car', body }, { query: f.query })).resolves.toMatchObject({ record })
    expect(f.service.writeCollectionRecord).toHaveBeenCalledWith({ ...body, scope, actorId: actor.actorId, collectionId: 'fleet', id: 'car' })
  })
  it('rechecks membership after schema loading and before a record write', async () => {
    const f = await setup()
    f.service.readCollectionDefinition.mockImplementationOnce(async () => {
      f.query.mockResolvedValue({ ...row, membership_role: 'viewer' })
      return f.saved
    })
    await expect(executePageStudioCollection(f.request, 'writeRecord', { collectionId: 'fleet', recordId: 'car', body: { expectedRevision: 0, schemaVersion: 1, archived: false, values: { name: 'Car' } } }, { query: f.query })).rejects.toMatchObject({ statusCode: 403 })
    expect(f.service.writeCollectionRecord).not.toHaveBeenCalled()
  })
  it('rejects mismatched scoped and tampered remote results', async () => {
    const f = await setup()
    f.service.listCollectionDefinitions.mockResolvedValueOnce({
      items: [{ ...f.saved, definition: { ...definition, label: 'Tampered' } }],
      nextCursor: null
    })
    await expect(
      executePageStudioCollection(f.request, 'listDefinitions', {}, { query: f.query })
    ).rejects.toMatchObject({ statusCode: 502 })
  })
  it('reports setup pending and revision conflict with safe messages', async () => {
    const f = await setup()
    f.service.listCollectionDefinitions.mockRejectedValueOnce(new Error('Collection schema upgrade required'))
    await expect(
      executePageStudioCollection(f.request, 'listDefinitions', {}, { query: f.query })
    ).rejects.toMatchObject({ statusCode: 503 })
    f.service.writeCollectionRecord.mockRejectedValueOnce(new Error('Collection record or schema conflict'))
    await expect(
      executePageStudioCollection(
        f.request,
        'writeRecord',
        {
          collectionId: 'fleet',
          recordId: 'car',
          body: { expectedRevision: 0, schemaVersion: 1, archived: false, values: { name: 'Car' } }
        },
        { query: f.query }
      )
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})
