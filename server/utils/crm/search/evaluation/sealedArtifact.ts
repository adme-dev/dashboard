import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import deploymentManifest from '../../../../../test/fixtures/crm-search-evaluation/holdout.deployment.manifest.json'

const digestPattern = /^[a-f0-9]{64}$/u
const artifactIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const keyVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
const envelopeVersion = 'crm-search-sealed-holdout-envelope-v1'
const keyringVersion = 'crm-search-sealed-holdout-keyring-v1'
const requiredQueryCount = 360
const maximumArtifactBytes = 8 * 1024 * 1024

export interface CrmSearchSealedHoldout {
  sealedJudgementSha256: string
  queries: unknown[]
  [key: string]: unknown
}

export interface CrmSearchSealedArtifactContract {
  version: 'crm-search-sealed-holdout-import-v1'
  objectKey: string
  contentSha256: string
  envelopeVersion: 'crm-search-sealed-holdout-envelope-v1'
  encryption: 'AES-256-GCM'
  compression: 'none'
  keyVersion: string
  judgementSha256: string
  queryCount: 360
  productionReady: true
}

export interface CrmSearchSealedArtifactProvider {
  readonly contract: CrmSearchSealedArtifactContract
  readBytes(input: { artifactId: string }): Promise<Uint8Array>
  readKey(input: { keyVersion: string }): Promise<Uint8Array>
}

export class CrmSearchSealedArtifactError extends Error {
  readonly code = 'crm_search_sealed_artifact_unavailable'

  constructor() {
    super('CRM search sealed evaluation artifact is unavailable')
    this.name = 'CrmSearchSealedArtifactError'
  }
}

function fail(): never {
  throw new CrmSearchSealedArtifactError()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) fail()
  return encoded
}

function parseContract(value: unknown): CrmSearchSealedArtifactContract {
  if (!isRecord(value)) fail()
  const allowedKeys = new Set([
    'version', 'sourcePath', 'objectKey', 'contentType', 'contentSha256',
    'envelopeVersion', 'encryption', 'compression', 'keyVersion',
    'judgementSha256', 'queryCount', 'keyBinding', 'provisioningOwner',
    'productionReady', 'importState', 'runtimeFormat'
  ])
  if (Object.keys(value).some(key => !allowedKeys.has(key))
    || value.version !== 'crm-search-sealed-holdout-import-v1'
    || typeof value.objectKey !== 'string'
    || !/^crm-search\/evaluation\/holdouts\/[A-Za-z0-9][A-Za-z0-9._:-]{0,199}\.json$/u.test(value.objectKey)
    || typeof value.contentSha256 !== 'string' || !digestPattern.test(value.contentSha256)
    || value.envelopeVersion !== envelopeVersion
    || value.encryption !== 'AES-256-GCM'
    || value.compression !== 'none'
    || typeof value.keyVersion !== 'string' || !keyVersionPattern.test(value.keyVersion)
    || typeof value.judgementSha256 !== 'string' || !digestPattern.test(value.judgementSha256)
    || value.queryCount !== requiredQueryCount
    || value.productionReady !== true
    || (value.keyBinding !== undefined && value.keyBinding !== 'CRM_SEARCH_SEALED_HOLDOUT_KEYRING')) {
    fail()
  }
  return Object.freeze({
    version: value.version,
    objectKey: value.objectKey,
    contentSha256: value.contentSha256,
    envelopeVersion: value.envelopeVersion,
    encryption: value.encryption,
    compression: value.compression,
    keyVersion: value.keyVersion,
    judgementSha256: value.judgementSha256,
    queryCount: value.queryCount,
    productionReady: value.productionReady
  })
}

function decodeBase64(value: unknown, expectedLength?: number): Uint8Array {
  if (typeof value !== 'string' || value.length < 4 || value.length > maximumArtifactBytes * 2
    || !base64Pattern.test(value)) fail()
  let decoded: string
  try {
    decoded = atob(value)
  } catch {
    fail()
  }
  if (expectedLength !== undefined && decoded.length !== expectedLength) fail()
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
  return bytes
}

function parseKeyring(value: unknown, requiredVersion: string): ReadonlyMap<string, Uint8Array> {
  if (typeof value !== 'string' || value.length < 2 || value.length > 2_048) fail()
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    fail()
  }
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['activeVersion', 'keys', 'version'])
    || parsed.version !== keyringVersion
    || parsed.activeVersion !== requiredVersion
    || !isRecord(parsed.keys)) fail()
  const entries = Object.entries(parsed.keys)
  if (entries.length < 1 || entries.length > 4
    || entries.some(([version]) => !keyVersionPattern.test(version))) fail()
  const keys = new Map<string, Uint8Array>()
  for (const [version, encoded] of entries) keys.set(version, decodeBase64(encoded, 32))
  if (!keys.has(requiredVersion)) fail()
  return keys
}

function isProvider(value: unknown): value is CrmSearchSealedArtifactProvider {
  return Boolean(value && typeof value === 'object'
    && typeof (value as { readBytes?: unknown }).readBytes === 'function'
    && typeof (value as { readKey?: unknown }).readKey === 'function'
    && (value as { contract?: unknown }).contract)
}

export function resolveCrmSearchSealedArtifactProvider(
  event: H3Event,
  contractValue: unknown = deploymentManifest
): CrmSearchSealedArtifactProvider {
  const contract = parseContract(contractValue)
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
  const bucket = env?.CRM_SEARCH_SEALED_HOLDOUTS
  if (!bucket || typeof bucket !== 'object'
    || typeof (bucket as { get?: unknown }).get !== 'function') fail()
  const keys = parseKeyring(env?.CRM_SEARCH_SEALED_HOLDOUT_KEYRING, contract.keyVersion)
  return Object.freeze({
    contract,
    async readBytes({ artifactId }: { artifactId: string }) {
      if (!artifactIdPattern.test(artifactId)
        || `crm-search/evaluation/holdouts/${artifactId}.json` !== contract.objectKey) fail()
      const object = await (bucket as { get(key: string): Promise<unknown> }).get(contract.objectKey)
      if (!object || typeof object !== 'object'
        || typeof (object as { arrayBuffer?: unknown }).arrayBuffer !== 'function') fail()
      const buffer = await (object as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer()
      return new Uint8Array(buffer)
    },
    async readKey({ keyVersion }: { keyVersion: string }) {
      if (keyVersion !== contract.keyVersion) fail()
      const key = keys.get(keyVersion)
      if (!key) fail()
      return key.slice()
    }
  })
}

const forbiddenKeyPattern = /^(?:email|emailaddress|phone|phonenumber|rawquery|querytext|sourcetext|notes|providerpayload|providerbody|vector|embedding)$/u
const emailPattern = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u
const phonePattern = /(?:\+?\d[\d ()-]{7,}\d)/u

function containsPiiLikeValue(value: string): boolean {
  if (emailPattern.test(value)) return true
  const digitCount = value.replace(/\D/gu, '').length
  return digitCount >= 8 && digitCount <= 15 && phonePattern.test(value)
}

function assertPrivacySafe(value: unknown, key = ''): void {
  const normalizedKey = key.normalize('NFKC').toLocaleLowerCase('en-AU').replace(/[^a-z0-9]/gu, '')
  if (forbiddenKeyPattern.test(normalizedKey)
    || (typeof value === 'string' && containsPiiLikeValue(value))) fail()
  if (Array.isArray(value)) {
    for (const item of value) assertPrivacySafe(item)
  } else if (isRecord(value)) {
    for (const [nestedKey, nested] of Object.entries(value)) assertPrivacySafe(nested, nestedKey)
  }
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function envelopeAad(envelope: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(canonicalJson({
    version: envelope.version,
    encryption: envelope.encryption,
    compression: envelope.compression,
    keyVersion: envelope.keyVersion,
    judgementSha256: envelope.judgementSha256,
    queryCount: envelope.queryCount
  }))
}

function validatePayload(value: unknown, expectedQueryCount: number): asserts value is Record<string, unknown> & {
  queries: unknown[]
} {
  if (!isRecord(value) || !hasExactKeys(value, ['queries', 'version'])
    || value.version !== 'crm-search-sealed-holdout-v1'
    || !Array.isArray(value.queries) || value.queries.length !== expectedQueryCount) fail()
  for (const query of value.queries) {
    if (!isRecord(query) || Object.keys(query).length < 1 || Object.keys(query).length > 32
      || typeof query.queryKeyDigest !== 'string' || !digestPattern.test(query.queryKeyDigest)) fail()
  }
}

export async function unsealCrmSearchHoldout(
  input: {
    artifactId: string
    expectedSealedJudgementSha256?: string | null
  },
  provider: CrmSearchSealedArtifactProvider
): Promise<CrmSearchSealedHoldout> {
  if (!artifactIdPattern.test(input.artifactId)
    || typeof input.expectedSealedJudgementSha256 !== 'string'
    || !digestPattern.test(input.expectedSealedJudgementSha256)
    || !isProvider(provider)) fail()
  const contract = parseContract(provider.contract)
  if (input.expectedSealedJudgementSha256 !== contract.judgementSha256
    || `crm-search/evaluation/holdouts/${input.artifactId}.json` !== contract.objectKey) fail()

  try {
    const bytes = await provider.readBytes({ artifactId: input.artifactId })
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > maximumArtifactBytes
      || createHash('sha256').update(bytes).digest('hex') !== contract.contentSha256
      || (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)) fail()
    const exactEnvelopeText = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (exactEnvelopeText.charCodeAt(0) === 0xFEFF) fail()
    const envelope = JSON.parse(exactEnvelopeText) as unknown
    if (!isRecord(envelope) || !hasExactKeys(envelope, [
      'authenticationTagBase64', 'ciphertextBase64', 'compression', 'encryption',
      'judgementSha256', 'keyVersion', 'nonceBase64', 'queryCount', 'version'
    ]) || canonicalJson(envelope) !== exactEnvelopeText
    || envelope.version !== contract.envelopeVersion
    || envelope.encryption !== contract.encryption
    || envelope.compression !== contract.compression
    || envelope.keyVersion !== contract.keyVersion
    || envelope.judgementSha256 !== contract.judgementSha256
    || envelope.queryCount !== contract.queryCount) fail()

    const nonce = decodeBase64(envelope.nonceBase64, 12)
    const ciphertext = decodeBase64(envelope.ciphertextBase64)
    const authenticationTag = decodeBase64(envelope.authenticationTagBase64, 16)
    if (ciphertext.byteLength < 2 || ciphertext.byteLength > maximumArtifactBytes) fail()
    const keyBytes = await provider.readKey({ keyVersion: contract.keyVersion })
    if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== 32) fail()
    const key = await crypto.subtle.importKey(
      'raw', exactArrayBuffer(keyBytes), 'AES-GCM', false, ['decrypt']
    )
    const authenticatedCiphertext = new Uint8Array(ciphertext.byteLength + authenticationTag.byteLength)
    authenticatedCiphertext.set(ciphertext)
    authenticatedCiphertext.set(authenticationTag, ciphertext.byteLength)
    const decrypted = new Uint8Array(await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: exactArrayBuffer(nonce),
      additionalData: exactArrayBuffer(envelopeAad(envelope)),
      tagLength: 128
    }, key, exactArrayBuffer(authenticatedCiphertext)))
    if (decrypted.byteLength < 2 || decrypted.byteLength > maximumArtifactBytes
      || createHash('sha256').update(decrypted).digest('hex') !== contract.judgementSha256
      || (decrypted[0] === 0xEF && decrypted[1] === 0xBB && decrypted[2] === 0xBF)) fail()
    const exactPlaintext = new TextDecoder('utf-8', { fatal: true }).decode(decrypted)
    if (exactPlaintext.charCodeAt(0) === 0xFEFF) fail()
    const parsed = JSON.parse(exactPlaintext) as unknown
    if (canonicalJson(parsed) !== exactPlaintext) fail()
    assertPrivacySafe(parsed)
    validatePayload(parsed, contract.queryCount)
    return Object.freeze({
      ...parsed,
      sealedJudgementSha256: contract.judgementSha256
    }) as CrmSearchSealedHoldout
  } catch (error) {
    if (error instanceof CrmSearchSealedArtifactError) throw error
    fail()
  }
}
