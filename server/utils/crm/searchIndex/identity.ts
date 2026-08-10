import {
  CRM_SEARCH_ENTITY_TYPES,
  type CrmSearchEntityType
} from './contracts'

export const CRM_SEARCH_NAMESPACE_DERIVATION_REVISION = 'namespace-sha256-base64url-v1' as const
export const CRM_SEARCH_VECTOR_ID_DERIVATION_REVISION = 'vector-id-sha256-base64url-v1' as const
export const CRM_SEARCH_SOURCE_TUPLE_DIGEST_REVISION = 'source-tuple-sha256-v1' as const
export const CRM_SEARCH_PROVIDER_ID_MAX_BYTES = 64 as const

const encoder = new TextEncoder()
const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const schemaVersionPattern = /^crm-search-v[1-9][0-9]*$/

export interface CrmSearchNamespaceIdentityInput {
  organisationScopeId: string
  clientId: string
}

export interface CrmSearchVectorIdentityInput extends CrmSearchNamespaceIdentityInput {
  schemaVersion: string
  entityType: CrmSearchEntityType
  entityId: string
}

export interface CrmSearchDerivedIdentity {
  value: string
  sourceTuple: string
  sourceTupleDigest: string
  derivationRevision:
    | typeof CRM_SEARCH_NAMESPACE_DERIVATION_REVISION
    | typeof CRM_SEARCH_VECTOR_ID_DERIVATION_REVISION
}

export interface CrmSearchRegisteredIdentity {
  value: string
  sourceTupleDigest: string
}

function requireCanonicalUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !canonicalUuidPattern.test(value)) {
    throw new TypeError(`${label} must be a canonical UUID`)
  }
  return value
}

function requireSchemaVersion(value: unknown): string {
  if (typeof value !== 'string' || !schemaVersionPattern.test(value)) {
    throw new TypeError('CRM search schema version is invalid')
  }
  return value
}

function requireEntityType(value: unknown): CrmSearchEntityType {
  if (typeof value !== 'string' || !CRM_SEARCH_ENTITY_TYPES.includes(value as CrmSearchEntityType)) {
    throw new TypeError('CRM search entity type is invalid')
  }
  return value as CrmSearchEntityType
}

/** Length framing uses UTF-8 byte counts, so adjacent tuple fields cannot alias. */
function frameTuple(parts: readonly string[]): string {
  return parts
    .map(part => `${encoder.encode(part).byteLength}:${part}`)
    .join('|')
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '')
}

async function deriveIdentity(
  derivationRevision: CrmSearchDerivedIdentity['derivationRevision'],
  tupleValues: readonly string[]
): Promise<CrmSearchDerivedIdentity> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto is unavailable')
  const sourceTuple = frameTuple([derivationRevision, ...tupleValues])
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256',
    encoder.encode(sourceTuple)
  ))
  // This separately domain-separated digest lets the registry distinguish an
  // actual provider-ID collision. Re-encoding `digest` as hex would provide no
  // independent collision evidence because `value` contains those same bytes.
  const sourceTupleDigest = new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256',
    encoder.encode(frameTuple([CRM_SEARCH_SOURCE_TUPLE_DIGEST_REVISION, sourceTuple]))
  ))
  const value = bytesToBase64Url(digest)
  if (encoder.encode(value).byteLength > CRM_SEARCH_PROVIDER_ID_MAX_BYTES) {
    throw new Error('Derived CRM search provider identity exceeds 64 bytes')
  }
  return {
    value,
    sourceTuple,
    sourceTupleDigest: bytesToHex(sourceTupleDigest),
    derivationRevision
  }
}

export async function deriveCrmSearchNamespaceIdentity(
  input: CrmSearchNamespaceIdentityInput
): Promise<CrmSearchDerivedIdentity> {
  const organisationScopeId = requireCanonicalUuid(input?.organisationScopeId, 'Organisation scope ID')
  const clientId = requireCanonicalUuid(input?.clientId, 'Client ID')
  return deriveIdentity(CRM_SEARCH_NAMESPACE_DERIVATION_REVISION, [
    organisationScopeId,
    clientId
  ])
}

export async function deriveCrmSearchNamespace(
  input: CrmSearchNamespaceIdentityInput
): Promise<string> {
  return (await deriveCrmSearchNamespaceIdentity(input)).value
}

export async function deriveCrmSearchVectorIdentity(
  input: CrmSearchVectorIdentityInput
): Promise<CrmSearchDerivedIdentity> {
  const organisationScopeId = requireCanonicalUuid(input?.organisationScopeId, 'Organisation scope ID')
  const clientId = requireCanonicalUuid(input?.clientId, 'Client ID')
  const schemaVersion = requireSchemaVersion(input?.schemaVersion)
  const entityType = requireEntityType(input?.entityType)
  const entityId = requireCanonicalUuid(input?.entityId, 'Entity ID')
  return deriveIdentity(CRM_SEARCH_VECTOR_ID_DERIVATION_REVISION, [
    organisationScopeId,
    clientId,
    schemaVersion,
    entityType,
    entityId
  ])
}

export async function deriveCrmSearchVectorId(
  input: CrmSearchVectorIdentityInput
): Promise<string> {
  return (await deriveCrmSearchVectorIdentity(input)).value
}

/**
 * A matching provider ID with a different registered tuple digest is a hard
 * collision. Registries must reject it before indexing is enabled.
 */
export function hasCrmSearchIdentityCollision(
  derived: CrmSearchDerivedIdentity,
  registered: CrmSearchRegisteredIdentity
): boolean {
  return registered.value === derived.value
    && registered.sourceTupleDigest !== derived.sourceTupleDigest
}
