// Keep prefix + signed token within SMTP's 64-octet local-part limit.
// A 128-bit opaque route key and 160-bit truncated HMAC both remain
// computationally infeasible to guess or forge.
const ROUTE_KEY_BYTES = 16
const SIGNATURE_BYTES = 20
const ROUTE_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{27}$/
const MAX_SECRET_VERSION = 999_999
const textEncoder = new TextEncoder()

export interface CreateCrmEmailReplyTokenInput {
  version: number
  domain: string
  secret: string
}

export interface CreatedCrmEmailReplyToken {
  token: string
  routeTokenHash: string
}

export interface VerifyCrmEmailReplyTokenInput {
  token: string
  domain: string
  secrets: Readonly<Record<number, string>>
}

export type VerifiedCrmEmailReplyToken
  = | { valid: true, version: number, routeTokenHash: string }
    | { valid: false }

export function canonicalizeCrmEmailDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/\.$/, '')
  if (domain.length < 3 || domain.length > 253) {
    throw new Error('Invalid reply domain')
  }

  const labels = domain.split('.')
  if (labels.length < 2 || labels.some(label =>
    label.length < 1
    || label.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  )) {
    throw new Error('Invalid reply domain')
  }

  return domain
}

function validateVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1 || version > MAX_SECRET_VERSION) {
    throw new Error('Invalid reply-token secret version')
  }
}

function validateSecret(secret: string): ArrayBuffer {
  const bytes = textEncoder.encode(secret)
  if (bytes.byteLength < 32) {
    throw new Error('Reply-token secret must contain at least 32 bytes')
  }
  return bytes.slice().buffer
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  if (bytesToBase64Url(bytes) !== value) {
    throw new Error('Non-canonical base64url value')
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  let difference = 0
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!
  }
  return difference === 0
}

async function signPayload(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    validateSecret(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(payload)
  )
  return new Uint8Array(signature)
}

async function hashRouteKey(routeKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(routeKey)
  )
  return bytesToHex(new Uint8Array(digest))
}

function signaturePayload(version: number, routeKey: string, domain: string): string {
  return `v${version}\n${routeKey}\n${domain}`
}

export async function createCrmEmailReplyToken(
  input: CreateCrmEmailReplyTokenInput
): Promise<CreatedCrmEmailReplyToken> {
  validateVersion(input.version)
  const domain = canonicalizeCrmEmailDomain(input.domain)
  const routeKeyBytes = crypto.getRandomValues(new Uint8Array(ROUTE_KEY_BYTES))
  const routeKey = bytesToBase64Url(routeKeyBytes)
  const signature = (await signPayload(
    signaturePayload(input.version, routeKey, domain),
    input.secret
  )).slice(0, SIGNATURE_BYTES)

  return {
    token: `v${input.version}.${routeKey}.${bytesToBase64Url(signature)}`,
    routeTokenHash: await hashRouteKey(routeKey)
  }
}

export async function verifyCrmEmailReplyToken(
  input: VerifyCrmEmailReplyTokenInput
): Promise<VerifiedCrmEmailReplyToken> {
  try {
    if (input.token.length > 128) return { valid: false }
    const parts = input.token.split('.')
    if (parts.length !== 3) return { valid: false }

    const [versionPart, routeKey, suppliedSignature] = parts
    if (
      !versionPart
      || !routeKey
      || !suppliedSignature
      || !/^v[1-9]\d{0,5}$/.test(versionPart)
      || !ROUTE_KEY_PATTERN.test(routeKey)
      || !SIGNATURE_PATTERN.test(suppliedSignature)
    ) {
      return { valid: false }
    }

    const version = Number(versionPart.slice(1))
    validateVersion(version)
    if (!Object.hasOwn(input.secrets, version)) return { valid: false }
    const secret = input.secrets[version]
    if (!secret) return { valid: false }

    const domain = canonicalizeCrmEmailDomain(input.domain)
    const expectedSignature = (await signPayload(
      signaturePayload(version, routeKey, domain),
      secret
    )).slice(0, SIGNATURE_BYTES)
    const signatureBytes = base64UrlToBytes(suppliedSignature)
    if (!constantTimeEqual(expectedSignature, signatureBytes)) {
      return { valid: false }
    }

    return {
      valid: true,
      version,
      routeTokenHash: await hashRouteKey(routeKey)
    }
  } catch {
    return { valid: false }
  }
}
