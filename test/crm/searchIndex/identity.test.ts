import { describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_NAMESPACE_DERIVATION_REVISION,
  CRM_SEARCH_VECTOR_ID_DERIVATION_REVISION,
  deriveCrmSearchNamespace,
  deriveCrmSearchNamespaceIdentity,
  deriveCrmSearchVectorId,
  deriveCrmSearchVectorIdentity,
  hasCrmSearchIdentityCollision
} from '~~/server/utils/crm/searchIndex/identity'

const organisationScopeId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const entityId = '33333333-3333-4333-8333-333333333333'

describe('CRM search identity derivation', () => {
  it('pins derivation revisions and exact golden provider identities', async () => {
    expect(CRM_SEARCH_NAMESPACE_DERIVATION_REVISION).toBe('namespace-sha256-base64url-v1')
    expect(CRM_SEARCH_VECTOR_ID_DERIVATION_REVISION).toBe('vector-id-sha256-base64url-v1')

    const namespace = await deriveCrmSearchNamespaceIdentity({ organisationScopeId, clientId })
    const vector = await deriveCrmSearchVectorIdentity({
      organisationScopeId,
      clientId,
      schemaVersion: 'crm-search-v1',
      entityType: 'person',
      entityId
    })

    expect(namespace.value).toBe('oNmEHqD21LtKoRd1vUFkSadsyBM8y9jelSpv6UfJjy4')
    expect(namespace.sourceTupleDigest).toBe('fc1fd862f61254f5f16247505dfe102f2f93a6fd8c2964417e494bba07a6175e')
    expect(vector.value).toBe('ohuXvpFaoi6E5QOIoE3zaeRuh-jOjPq5-JYyn0S6ajE')
    expect(vector.sourceTupleDigest).toBe('a5e9b480f4d6bcf23cc6b46b378dc7790ae2eb8b0289c009209ec533a1ce8038')
  })

  it('derives a deterministic opaque namespace within the 64-byte provider bound', async () => {
    const first = await deriveCrmSearchNamespace({ organisationScopeId, clientId })
    const second = await deriveCrmSearchNamespace({ organisationScopeId, clientId })

    expect(first).toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(new TextEncoder().encode(first).byteLength).toBeLessThanOrEqual(64)
    expect(first).not.toContain(organisationScopeId)
    expect(first).not.toContain(clientId)
  })

  it('exposes the domain-separated length-framed source tuple needed for collision checks', async () => {
    const identity = await deriveCrmSearchNamespaceIdentity({ organisationScopeId, clientId })

    expect(identity).toMatchObject({
      value: await deriveCrmSearchNamespace({ organisationScopeId, clientId }),
      derivationRevision: CRM_SEARCH_NAMESPACE_DERIVATION_REVISION
    })
    expect(identity.sourceTuple).toContain(CRM_SEARCH_NAMESPACE_DERIVATION_REVISION)
    expect(identity.sourceTuple).toContain(`${new TextEncoder().encode(clientId).byteLength}:${clientId}`)
    expect(identity.sourceTupleDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(identity.sourceTupleDigest).not.toBe(
      Buffer.from(identity.value, 'base64url').toString('hex')
    )
  })

  it('does not permit tuple-boundary ambiguity or cross-domain reuse', async () => {
    const namespace = await deriveCrmSearchNamespaceIdentity({ organisationScopeId, clientId })
    const vector = await deriveCrmSearchVectorIdentity({
      organisationScopeId,
      clientId,
      schemaVersion: 'crm-search-v1',
      entityType: 'person',
      entityId
    })

    expect(namespace.sourceTuple).not.toBe(vector.sourceTuple)
    expect(namespace.value).not.toBe(vector.value)
    expect(vector.derivationRevision).toBe(CRM_SEARCH_VECTOR_ID_DERIVATION_REVISION)
  })

  it('changes vector identity for every server-owned identity component', async () => {
    const base = {
      organisationScopeId,
      clientId,
      schemaVersion: 'crm-search-v1',
      entityType: 'person' as const,
      entityId
    }
    const values = await Promise.all([
      deriveCrmSearchVectorId(base),
      deriveCrmSearchVectorId({ ...base, organisationScopeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      deriveCrmSearchVectorId({ ...base, clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
      deriveCrmSearchVectorId({ ...base, schemaVersion: 'crm-search-v2' }),
      deriveCrmSearchVectorId({ ...base, entityType: 'company' }),
      deriveCrmSearchVectorId({ ...base, entityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })
    ])

    expect(new Set(values).size).toBe(values.length)
    expect(values.every(value => /^[A-Za-z0-9_-]+$/.test(value))).toBe(true)
    expect(values.every(value => new TextEncoder().encode(value).byteLength <= 64)).toBe(true)
  })

  it('detects a provider identifier collision only when the registered tuple digest differs', async () => {
    const identity = await deriveCrmSearchNamespaceIdentity({ organisationScopeId, clientId })

    expect(hasCrmSearchIdentityCollision(identity, {
      value: identity.value,
      sourceTupleDigest: identity.sourceTupleDigest
    })).toBe(false)
    expect(hasCrmSearchIdentityCollision(identity, {
      value: identity.value,
      sourceTupleDigest: 'f'.repeat(64)
    })).toBe(true)
    expect(hasCrmSearchIdentityCollision(identity, {
      value: 'different-provider-id',
      sourceTupleDigest: 'f'.repeat(64)
    })).toBe(false)
  })

  it.each([
    ['non-canonical organisation ID', { organisationScopeId: 'not-a-uuid', clientId }],
    ['non-canonical client ID', { organisationScopeId, clientId: 'not-a-uuid' }]
  ])('fails closed for %s', async (_case, input) => {
    await expect(deriveCrmSearchNamespace(input)).rejects.toThrow(/canonical UUID/i)
  })

  it('fails closed for unsupported entity types and schema versions', async () => {
    await expect(deriveCrmSearchVectorId({
      organisationScopeId,
      clientId,
      schemaVersion: '../crm-search-v1',
      entityType: 'person',
      entityId
    })).rejects.toThrow(/schema version/i)

    await expect(deriveCrmSearchVectorId({
      organisationScopeId,
      clientId,
      schemaVersion: 'crm-search-v1',
      entityType: 'activity' as never,
      entityId
    })).rejects.toThrow(/entity type/i)
  })
})
