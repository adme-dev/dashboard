import { z } from 'zod'

import {
  CRM_SEARCH_CORRELATION_ID_BYTES,
  CRM_SEARCH_INDEX_PROTOCOL_VERSION,
  CRM_SEARCH_OPERATION_ID_BYTES,
  CRM_SEARCH_REQUEST_BODY_MAX_BYTES,
  canonicalCrmSearchIndexQueueMessage,
  crmSearchAcceptedProtocolVersions,
  type CrmSearchIndexQueueMessage,
  type CrmSearchServicePath
} from './crmSearchIndexProtocol'

/**
 * Cloudflare Workers exposes the standard Web Crypto HMAC sign/verify API:
 * https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
 */
export const CRM_SEARCH_SIGNING_REVISION = 'crm-search-service-hmac-v1' as const
export const CRM_SEARCH_SERVICE_KEY_BYTES = 32 as const
export const CRM_SEARCH_SERVICE_KEY_VERSION_MAX_BYTES = 32 as const
export const CRM_SEARCH_SERVICE_KEYRING_MAX_KEYS = 3 as const
export const CRM_SEARCH_SERVICE_KEY_MAX_OVERLAP_SECONDS = 3_600 as const
export const CRM_SEARCH_SERVICE_REQUEST_MAX_AGE_SECONDS = 60 as const
export const CRM_SEARCH_SERVICE_REQUEST_FUTURE_SKEW_SECONDS = 5 as const
export const CRM_SEARCH_CANONICAL_SIGNING_MAX_BYTES = 384 as const

export const CRM_SEARCH_SERVICE_HEADERS = Object.freeze({
  protocolVersion: 'x-xeroflow-crm-search-protocol',
  operationId: 'x-xeroflow-crm-search-operation-id',
  correlationId: 'x-xeroflow-crm-search-correlation-id',
  timestamp: 'x-xeroflow-crm-search-timestamp',
  keyVersion: 'x-xeroflow-crm-search-key-version',
  bodyDigest: 'x-xeroflow-crm-search-body-sha256',
  signature: 'x-xeroflow-crm-search-signature'
} as const)

const encoder = new TextEncoder()
const canonicalUuidPattern
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const keyVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/
const encodedKeyPattern = /^[A-Za-z0-9_-]{43}$/
const sha256Pattern = /^[a-f0-9]{64}$/
const encodedSignaturePattern = /^[A-Za-z0-9_-]{43}$/
const timestampPattern = /^[1-9][0-9]{9,11}$/
const protocolHeaderPattern = /^[1-9][0-9]{0,4}$/

const keyVersionSchema = z.string()
  .regex(keyVersionPattern)
  .refine(value => encoder.encode(value).byteLength <= CRM_SEARCH_SERVICE_KEY_VERSION_MAX_BYTES)
const keyWindowSchema = {
  keyVersion: keyVersionSchema,
  secret: z.string().regex(encodedKeyPattern),
  notBefore: z.number().int().safe().nonnegative(),
  notAfter: z.number().int().safe().positive()
} as const
const serviceKeySchema = z.discriminatedUnion('status', [
  z.object({ ...keyWindowSchema, status: z.literal('active') }).strict(),
  z.object({
    ...keyWindowSchema,
    status: z.literal('previous'),
    overlapUntil: z.number().int().safe().positive()
  }).strict(),
  z.object({ ...keyWindowSchema, status: z.literal('retired') }).strict()
])
const serviceKeyringSchema = z.object({
  activeKeyVersion: keyVersionSchema,
  keys: z.record(z.string(), z.unknown())
}).strict()

export type CrmSearchServiceKeyStatus = 'active' | 'previous' | 'retired'

export interface CrmSearchServiceKey {
  keyVersion: string
  /** Canonical unpadded base64url encoding of exactly 32 random bytes. */
  secret: string
  status: CrmSearchServiceKeyStatus
  notBefore: number
  notAfter: number
  overlapUntil?: number
}

export interface CrmSearchServiceKeyring {
  activeKeyVersion: string
  keys: Readonly<Record<string, CrmSearchServiceKey>>
}

export interface CrmSearchUnsignedServiceRequest {
  method: 'POST'
  path: CrmSearchServicePath
  timestamp: string
  operationId: string
  correlationId: string
  protocolVersion: number
  body: string
}

export interface CrmSearchServiceRequest extends CrmSearchUnsignedServiceRequest {
  keyVersion: string
  bodyDigest: string
  /** Canonical unpadded base64url encoding of the 32-byte HMAC. */
  signature: string
}

export interface CrmSearchSignedServiceRequest {
  body: string
  headers: Record<string, string>
}

export type CrmSearchHeaderRecord = Readonly<Record<
  string,
  string | readonly string[] | undefined
>>

interface VerifiedKeyring {
  value: CrmSearchServiceKeyring
  keyBytes: Readonly<Record<string, Uint8Array<ArrayBuffer>>>
}

function byteLength(value: string): number {
  return encoder.encode(value).byteLength
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function canonicalBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '')
}

function decodeBase64Url(value: string, pattern: RegExp): Uint8Array<ArrayBuffer> | null {
  if (!pattern.test(value)) return null
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - (base64.length % 4)) % 4)
    const binary = atob(`${base64}${padding}`)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return canonicalBase64Url(bytes) === value ? bytes : null
  } catch {
    return null
  }
}

function validateKeyring(value: unknown): VerifiedKeyring | null {
  const root = serviceKeyringSchema.safeParse(value)
  if (!root.success || !isPlainRecord(root.data.keys)) return null

  const entries = Object.entries(root.data.keys)
  if (entries.length < 1 || entries.length > CRM_SEARCH_SERVICE_KEYRING_MAX_KEYS) return null
  const parsed: Record<string, CrmSearchServiceKey> = Object.create(null)
  const keyBytes: Record<string, Uint8Array<ArrayBuffer>> = Object.create(null)
  const secretValues = new Set<string>()
  let activeCount = 0
  let previousCount = 0
  let retiredCount = 0

  for (const [recordVersion, raw] of entries) {
    if (!keyVersionPattern.test(recordVersion)) return null
    const entry = serviceKeySchema.safeParse(raw)
    if (!entry.success) return null
    const key = entry.data
    if (key.keyVersion !== recordVersion || key.notAfter <= key.notBefore) return null

    const decoded = decodeBase64Url(key.secret, encodedKeyPattern)
    if (!decoded || decoded.byteLength !== CRM_SEARCH_SERVICE_KEY_BYTES) return null
    if (secretValues.has(key.secret)) return null
    secretValues.add(key.secret)

    const status = key.status
    if (status === 'previous') {
      previousCount++
    } else {
      if (status === 'active') activeCount++
      else retiredCount++
    }

    parsed[recordVersion] = {
      keyVersion: recordVersion,
      secret: key.secret,
      status,
      notBefore: key.notBefore,
      notAfter: key.notAfter,
      ...(status === 'previous' ? { overlapUntil: key.overlapUntil } : {})
    }
    keyBytes[recordVersion] = decoded
  }

  if (activeCount !== 1 || previousCount > 1 || retiredCount > 1) return null
  const active = parsed[root.data.activeKeyVersion]
  if (!active || active.status !== 'active') return null
  const previous = Object.values(parsed).find(key => key.status === 'previous')
  if (previous) {
    if (
      previous.notBefore > active.notBefore
      || previous.overlapUntil! <= active.notBefore
      || previous.overlapUntil! > active.notBefore + CRM_SEARCH_SERVICE_KEY_MAX_OVERLAP_SECONDS
      || previous.overlapUntil! > active.notAfter
      || previous.overlapUntil! > previous.notAfter
    ) return null
  }

  return {
    value: {
      activeKeyVersion: root.data.activeKeyVersion,
      keys: Object.freeze(parsed)
    },
    keyBytes: Object.freeze(keyBytes)
  }
}

export function parseCrmSearchServiceKeyring(value: unknown): CrmSearchServiceKeyring | null {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) as unknown : value
    return validateKeyring(candidate)?.value ?? null
  } catch {
    return null
  }
}

function requireKeyring(value: unknown): VerifiedKeyring {
  const valid = validateKeyring(value)
  if (!valid) throw new TypeError('CRM search service keyring or key material is invalid')
  return valid
}

function validUuid(value: unknown, expectedBytes: number): value is string {
  return typeof value === 'string'
    && byteLength(value) === expectedBytes
    && canonicalUuidPattern.test(value)
}

function validProtocolVersion(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= 65_535
}

const serviceRequestSchema = z.object({
  method: z.literal('POST'),
  path: z.union([
    z.literal('/api/internal/crm-search/process'),
    z.literal('/api/internal/crm-search/dead-letter')
  ]),
  timestamp: z.string().regex(timestampPattern).refine((value) => {
    const seconds = Number(value)
    return Number.isSafeInteger(seconds) && seconds >= 0
  }),
  operationId: z.string().refine(value => validUuid(value, CRM_SEARCH_OPERATION_ID_BYTES)),
  correlationId: z.string().refine(value => validUuid(value, CRM_SEARCH_CORRELATION_ID_BYTES)),
  protocolVersion: z.number().int().safe().min(1).max(65_535),
  body: z.string().refine(value => byteLength(value) <= CRM_SEARCH_REQUEST_BODY_MAX_BYTES),
  keyVersion: keyVersionSchema,
  bodyDigest: z.string().regex(sha256Pattern),
  signature: z.string().regex(encodedSignaturePattern)
}).strict()

function validateRequestStructure(value: unknown): CrmSearchServiceRequest | null {
  const parsed = serviceRequestSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function canonicalCoordinates(value: {
  method: 'POST'
  path: CrmSearchServicePath
  timestamp: string
  operationId: string
  correlationId: string
  protocolVersion: number
  bodyDigest: string
}): string {
  const canonical = [
    CRM_SEARCH_SIGNING_REVISION,
    value.method,
    value.path,
    value.timestamp,
    value.operationId,
    value.correlationId,
    String(value.protocolVersion),
    value.bodyDigest
  ].join('\n')
  if (byteLength(canonical) > CRM_SEARCH_CANONICAL_SIGNING_MAX_BYTES) {
    throw new RangeError('CRM search canonical signing input exceeds its byte bound')
  }
  return canonical
}

export function canonicalCrmSearchServiceRequest(value: CrmSearchServiceRequest): string {
  const valid = validateRequestStructure(value)
  if (!valid) throw new TypeError('CRM search service request is malformed')
  return canonicalCoordinates(valid)
}

function headerValue(headers: CrmSearchHeaderRecord, name: string): string | null {
  const matching = Object.entries(headers).filter(([key]) => key.toLowerCase() === name)
  if (matching.length !== 1) return null
  const value = matching[0]?.[1]
  if (typeof value !== 'string') return null
  return value
}

export function extractCrmSearchServiceRequest(
  headers: CrmSearchHeaderRecord,
  body: string,
  method: string,
  path: string
): CrmSearchServiceRequest | null {
  const contentType = headerValue(headers, 'content-type')
  const protocol = headerValue(headers, CRM_SEARCH_SERVICE_HEADERS.protocolVersion)
  const signatureHeader = headerValue(headers, CRM_SEARCH_SERVICE_HEADERS.signature)
  if (
    contentType?.toLowerCase() !== 'application/json'
    || !protocol
    || !protocolHeaderPattern.test(protocol)
    || !/^v1=[A-Za-z0-9_-]{43}$/.test(signatureHeader ?? '')
  ) return null

  return validateRequestStructure({
    method,
    path,
    timestamp: headerValue(headers, CRM_SEARCH_SERVICE_HEADERS.timestamp),
    operationId: headerValue(headers, CRM_SEARCH_SERVICE_HEADERS.operationId),
    correlationId: headerValue(headers, CRM_SEARCH_SERVICE_HEADERS.correlationId),
    protocolVersion: Number(protocol),
    keyVersion: headerValue(headers, CRM_SEARCH_SERVICE_HEADERS.keyVersion),
    bodyDigest: headerValue(headers, CRM_SEARCH_SERVICE_HEADERS.bodyDigest),
    signature: signatureHeader!.slice(3),
    body
  })
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256',
    encoder.encode(value)
  ))
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function importHmacKey(
  bytes: Uint8Array<ArrayBuffer>,
  usage: 'sign' | 'verify'
): Promise<CryptoKey> {
  return await globalThis.crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  )
}

function requestIsFresh(timestamp: string, nowMs: number): boolean {
  if (!Number.isFinite(nowMs)) return false
  const timestampSeconds = Number(timestamp)
  const nowSeconds = Math.floor(nowMs / 1000)
  return nowSeconds - timestampSeconds <= CRM_SEARCH_SERVICE_REQUEST_MAX_AGE_SECONDS
    && timestampSeconds - nowSeconds <= CRM_SEARCH_SERVICE_REQUEST_FUTURE_SKEW_SECONDS
}

function keyMayVerify(
  requested: CrmSearchServiceKey,
  keyring: CrmSearchServiceKeyring,
  nowSeconds: number
): boolean {
  const active = keyring.keys[keyring.activeKeyVersion]
  if (!active || active.status !== 'active') return false
  if (requested.status === 'active') {
    return requested.keyVersion === keyring.activeKeyVersion
      && nowSeconds >= requested.notBefore
      && nowSeconds < requested.notAfter
  }
  if (requested.status !== 'previous' || requested.overlapUntil === undefined) return false
  return nowSeconds >= active.notBefore
    && nowSeconds < active.notAfter
    && nowSeconds >= requested.notBefore
    && nowSeconds < requested.notAfter
    && nowSeconds < requested.overlapUntil
}

function validateAcceptedProtocols(value: readonly number[]): readonly number[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return null
  if (!value.every(validProtocolVersion) || new Set(value).size !== value.length) return null
  const expected = crmSearchAcceptedProtocolVersions(value[0]!)
  return expected.length === value.length && expected.every((item, index) => item === value[index])
    ? value
    : null
}

export async function signCrmSearchServiceRequest(
  input: CrmSearchUnsignedServiceRequest,
  keyringInput: CrmSearchServiceKeyring,
  options: { nowMs?: number } = {}
): Promise<Record<string, string>> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto is unavailable')
  const keyring = requireKeyring(keyringInput)
  const nowMs = options.nowMs ?? Date.now()
  const active = keyring.value.keys[keyring.value.activeKeyVersion]!
  const nowSeconds = Math.floor(nowMs / 1000)
  if (
    active.status !== 'active'
    || nowSeconds < active.notBefore
    || nowSeconds >= active.notAfter
  ) throw new Error('CRM search active key is not currently valid for signing')

  const bodyDigest = await sha256Hex(input.body)
  const candidate = validateRequestStructure({
    ...input,
    keyVersion: active.keyVersion,
    bodyDigest,
    signature: 'A'.repeat(43)
  })
  if (!candidate || !requestIsFresh(candidate.timestamp, nowMs)) {
    throw new TypeError('CRM search unsigned service request is malformed or stale')
  }
  const canonical = canonicalCoordinates(candidate)
  const key = await importHmacKey(keyring.keyBytes[active.keyVersion]!, 'sign')
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(canonical)
  ))

  return {
    'content-type': 'application/json',
    [CRM_SEARCH_SERVICE_HEADERS.protocolVersion]: String(candidate.protocolVersion),
    [CRM_SEARCH_SERVICE_HEADERS.operationId]: candidate.operationId,
    [CRM_SEARCH_SERVICE_HEADERS.correlationId]: candidate.correlationId,
    [CRM_SEARCH_SERVICE_HEADERS.timestamp]: candidate.timestamp,
    [CRM_SEARCH_SERVICE_HEADERS.keyVersion]: active.keyVersion,
    [CRM_SEARCH_SERVICE_HEADERS.bodyDigest]: bodyDigest,
    [CRM_SEARCH_SERVICE_HEADERS.signature]: `v1=${canonicalBase64Url(signature)}`
  }
}

export async function createCrmSearchSignedServiceRequest(
  message: CrmSearchIndexQueueMessage,
  path: CrmSearchServicePath,
  keyring: CrmSearchServiceKeyring,
  options: { nowMs?: number } = {}
): Promise<CrmSearchSignedServiceRequest> {
  const nowMs = options.nowMs ?? Date.now()
  const body = canonicalCrmSearchIndexQueueMessage(message, { nowMs })
  const headers = await signCrmSearchServiceRequest({
    method: 'POST',
    path,
    timestamp: String(Math.floor(nowMs / 1000)),
    operationId: message.operationId,
    correlationId: message.correlationId,
    protocolVersion: message.protocolVersion,
    body
  }, keyring, { nowMs })
  return { body, headers }
}

export async function verifyCrmSearchServiceRequest(
  input: unknown,
  keyringInput: CrmSearchServiceKeyring,
  options: { nowMs?: number, acceptedProtocolVersions?: readonly number[] } = {}
): Promise<boolean> {
  try {
    if (!globalThis.crypto?.subtle) return false
    const request = validateRequestStructure(input)
    const keyring = validateKeyring(keyringInput)
    if (!request || !keyring) return false
    const requestedKey = keyring.value.keys[request.keyVersion]
    const requestedKeyBytes = keyring.keyBytes[request.keyVersion]
    if (!requestedKey || !requestedKeyBytes) return false

    const signature = decodeBase64Url(request.signature, encodedSignaturePattern)
    if (!signature || signature.byteLength !== 32) return false
    const canonical = canonicalCoordinates(request)
    const key = await importHmacKey(requestedKeyBytes, 'verify')
    const validSignature = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(canonical)
    )
    if (!validSignature) return false

    const nowMs = options.nowMs ?? Date.now()
    const nowSeconds = Math.floor(nowMs / 1000)
    if (!keyMayVerify(requestedKey, keyring.value, nowSeconds)) return false
    if (!requestIsFresh(request.timestamp, nowMs)) return false
    const accepted = validateAcceptedProtocols(
      options.acceptedProtocolVersions
      ?? crmSearchAcceptedProtocolVersions(CRM_SEARCH_INDEX_PROTOCOL_VERSION)
    )
    if (!accepted?.includes(request.protocolVersion)) return false

    const actualBodyDigest = await sha256Hex(request.body)
    return actualBodyDigest === request.bodyDigest
  } catch {
    return false
  }
}
