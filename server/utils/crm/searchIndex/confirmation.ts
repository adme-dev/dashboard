export const CRM_SEARCH_CONFIRMATION_KEY_BYTES = 32 as const
export const CRM_SEARCH_CONFIRMATION_KEYRING_MAX_KEYS = 8 as const
export const CRM_SEARCH_CONFIRMATION_KEY_VERSION_MAX_BYTES = 64 as const

const encoder = new TextEncoder()
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const providerIdPattern = /^[A-Za-z0-9_-]{1,64}$/
const schemaVersionPattern = /^crm-search-v[1-9][0-9]*$/
const digestPattern = /^[a-f0-9]{64}$/
const keyVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/
const encodedKeyPattern = /^[A-Za-z0-9_-]{43}$/

export interface CrmSearchConfirmationKeyring {
  activeKeyVersion: string
  /** Canonical unpadded base64url encodings of dedicated 32-byte keys. */
  keys: Readonly<Record<string, string>>
}

export interface CreateCrmSearchConfirmationTagInput {
  organisationScopeId: string
  clientId: string
  vectorId: string
  schemaVersion: string
  sourceRevision: number
  contentHash: string
}

export interface CrmSearchConfirmationTag {
  confirmationTag: string
  confirmationKeyVersion: string
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}

function canonicalBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '')
}

function decodeKey(value: unknown): Uint8Array<ArrayBuffer> | null {
  if (typeof value !== 'string' || !encodedKeyPattern.test(value)) return null
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(`${base64}${'='.repeat((4 - base64.length % 4) % 4)}`)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes.byteLength === CRM_SEARCH_CONFIRMATION_KEY_BYTES
      && canonicalBase64Url(bytes) === value
      ? bytes
      : null
  } catch {
    return null
  }
}

function validKeyVersion(value: unknown): value is string {
  return typeof value === 'string'
    && encoder.encode(value).byteLength <= CRM_SEARCH_CONFIRMATION_KEY_VERSION_MAX_BYTES
    && keyVersionPattern.test(value)
}

export function parseCrmSearchConfirmationKeyring(
  value: unknown
): CrmSearchConfirmationKeyring | null {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!isPlainRecord(candidate)) return null
    if (
      Object.keys(candidate).length !== 2
      || !Object.prototype.hasOwnProperty.call(candidate, 'activeKeyVersion')
      || !Object.prototype.hasOwnProperty.call(candidate, 'keys')
    ) return null

    const activeKeyVersion = ownValue(candidate, 'activeKeyVersion')
    const rawKeys = ownValue(candidate, 'keys')
    if (!validKeyVersion(activeKeyVersion) || !isPlainRecord(rawKeys)) return null
    const keyVersions = Object.keys(rawKeys)
    if (
      keyVersions.length < 1
      || keyVersions.length > CRM_SEARCH_CONFIRMATION_KEYRING_MAX_KEYS
    ) return null

    const keys: Record<string, string> = Object.create(null)
    const uniqueSecrets = new Set<string>()
    for (const version of keyVersions) {
      if (!validKeyVersion(version)) return null
      const secret = ownValue(rawKeys, version)
      if (typeof secret !== 'string' || !decodeKey(secret)) return null
      if (uniqueSecrets.has(secret)) return null
      uniqueSecrets.add(secret)
      keys[version] = secret
    }
    if (!Object.prototype.hasOwnProperty.call(keys, activeKeyVersion)) return null
    return {
      activeKeyVersion,
      keys: Object.freeze(keys)
    }
  } catch {
    return null
  }
}

function requireInput(input: CreateCrmSearchConfirmationTagInput) {
  if (
    !input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.organisationScopeId !== 'string'
    || !uuidPattern.test(input.organisationScopeId)
    || typeof input.clientId !== 'string'
    || !uuidPattern.test(input.clientId)
    || typeof input.vectorId !== 'string'
    || encoder.encode(input.vectorId).byteLength > 64
    || !providerIdPattern.test(input.vectorId)
    || typeof input.schemaVersion !== 'string'
    || !schemaVersionPattern.test(input.schemaVersion)
    || !Number.isSafeInteger(input.sourceRevision)
    || input.sourceRevision < 1
    || typeof input.contentHash !== 'string'
    || !digestPattern.test(input.contentHash)
  ) throw new TypeError('CRM search confirmation input is invalid')
  return input
}

function frameTuple(parts: readonly string[]): string {
  return parts.map(part => `${encoder.encode(part).byteLength}:${part}`).join('|')
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Signs only with the configured active confirmation key. */
export async function createCrmSearchConfirmationTag(
  rawInput: CreateCrmSearchConfirmationTagInput,
  rawKeyring: CrmSearchConfirmationKeyring
): Promise<CrmSearchConfirmationTag> {
  const input = requireInput(rawInput)
  const keyring = parseCrmSearchConfirmationKeyring(rawKeyring)
  if (!keyring) throw new TypeError('CRM search confirmation keyring is invalid')
  const keyBytes = decodeKey(keyring.keys[keyring.activeKeyVersion])
  if (!keyBytes || !globalThis.crypto?.subtle) {
    throw new Error('CRM search confirmation key material is unavailable')
  }
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const message = frameTuple([
    input.organisationScopeId,
    input.clientId,
    input.vectorId,
    input.schemaVersion,
    String(input.sourceRevision),
    input.contentHash
  ])
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  ))
  return {
    confirmationTag: `hmac-sha256:${bytesToHex(signature)}`,
    confirmationKeyVersion: keyring.activeKeyVersion
  }
}
