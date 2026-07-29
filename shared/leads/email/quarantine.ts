import {
  EmailStagedManifestSchema,
  type EmailStagedManifest
} from './contracts'

const encoder = new TextEncoder()
const MAGIC = new Uint8Array([0x58, 0x45, 0x4c, 0x31])
const SALT_BYTES = 16
const IV_BYTES = 12
const HEADER_BYTES = MAGIC.byteLength + SALT_BYTES + IV_BYTES
const STAGED_MAGIC_V1 = new Uint8Array([0x58, 0x45, 0x53, 0x31])
const STAGED_MAGIC_V2 = new Uint8Array([0x58, 0x45, 0x53, 0x32])

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  if (secret.length < 16 || secret.length > 4096) {
    throw new Error('Quarantine encryption secret is unavailable')
  }
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'HKDF',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(salt),
    info: encoder.encode('xeroflow-email-quarantine-v1')
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function secretsAreEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right))
  ])
  const first = new Uint8Array(a)
  const second = new Uint8Array(b)
  let difference = 0
  for (let index = 0; index < first.length; index++) {
    difference |= first[index]! ^ second[index]!
  }
  return difference === 0
}

export function createOpaqueEmailObjectKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const encoded = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `email-ingestions/${encoded}`
}

async function encryptRawEmailWithAad(
  raw: Uint8Array,
  secret: string,
  additionalData?: Uint8Array
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(secret, salt)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, ...(additionalData ? { additionalData } : {}) },
    key,
    new Uint8Array(raw)
  ))
  const encrypted = new Uint8Array(HEADER_BYTES + ciphertext.byteLength)
  encrypted.set(MAGIC, 0)
  encrypted.set(salt, MAGIC.byteLength)
  encrypted.set(iv, MAGIC.byteLength + SALT_BYTES)
  encrypted.set(ciphertext, HEADER_BYTES)
  return encrypted
}

export async function encryptRawEmail(raw: Uint8Array, secret: string): Promise<Uint8Array> {
  return encryptRawEmailWithAad(raw, secret)
}

function manifestBytes(manifest: EmailStagedManifest): Uint8Array {
  return encoder.encode(JSON.stringify(EmailStagedManifestSchema.parse(manifest)))
}

export async function encryptStagedEmail(
  raw: Uint8Array,
  envelopeSender: string | null,
  secret: string,
  inputManifest: EmailStagedManifest
): Promise<Uint8Array> {
  const manifest = EmailStagedManifestSchema.parse(inputManifest)
  const encodedManifest = manifestBytes(manifest)
  const sender = encoder.encode(envelopeSender ?? '')
  if (sender.byteLength > 4096) throw new Error('Envelope sender exceeds limit')
  const manifestOffset = STAGED_MAGIC_V2.byteLength + 4
  const senderLengthOffset = manifestOffset + encodedManifest.byteLength
  const senderOffset = senderLengthOffset + 4
  const plaintext = new Uint8Array(senderOffset + sender.byteLength + raw.byteLength)
  plaintext.set(STAGED_MAGIC_V2)
  const view = new DataView(plaintext.buffer)
  view.setUint32(STAGED_MAGIC_V2.byteLength, encodedManifest.byteLength)
  plaintext.set(encodedManifest, manifestOffset)
  view.setUint32(senderLengthOffset, sender.byteLength)
  plaintext.set(sender, senderOffset)
  plaintext.set(raw, senderOffset + sender.byteLength)
  return encryptRawEmailWithAad(plaintext, secret, encodedManifest)
}

async function decryptRawEmailWithAad(
  encrypted: Uint8Array,
  secret: string,
  additionalData?: Uint8Array
): Promise<Uint8Array> {
  if (encrypted.byteLength <= HEADER_BYTES + 16) throw new Error('Invalid encrypted email')
  for (let index = 0; index < MAGIC.byteLength; index++) {
    if (encrypted[index] !== MAGIC[index]) throw new Error('Invalid encrypted email')
  }
  const salt = encrypted.slice(MAGIC.byteLength, MAGIC.byteLength + SALT_BYTES)
  const iv = encrypted.slice(MAGIC.byteLength + SALT_BYTES, HEADER_BYTES)
  const key = await deriveKey(secret, salt)
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, ...(additionalData ? { additionalData } : {}) },
    key,
    encrypted.slice(HEADER_BYTES)
  ))
}

export async function decryptRawEmail(encrypted: Uint8Array, secret: string): Promise<Uint8Array> {
  return decryptRawEmailWithAad(encrypted, secret)
}

export async function decryptStagedEmail(
  encrypted: Uint8Array,
  secret: string,
  expectedManifest?: EmailStagedManifest
): Promise<{
  format: 'sealed' | 'legacy'
  raw: Uint8Array
  envelopeSender: string | null
  manifest?: EmailStagedManifest
}> {
  const expected = expectedManifest
    ? EmailStagedManifestSchema.parse(expectedManifest)
    : undefined
  let plaintext: Uint8Array
  if (expected) {
    try {
      plaintext = await decryptRawEmailWithAad(encrypted, secret, manifestBytes(expected))
    } catch {
      plaintext = await decryptRawEmail(encrypted, secret)
    }
  } else {
    plaintext = await decryptRawEmail(encrypted, secret)
  }
  const isCurrent = STAGED_MAGIC_V2.every((byte, index) => plaintext[index] === byte)
  if (isCurrent) {
    if (!expected || plaintext.byteLength < STAGED_MAGIC_V2.byteLength + 8) {
      throw new Error('Invalid staged email manifest')
    }
    const view = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength)
    const encodedManifestBytes = view.getUint32(STAGED_MAGIC_V2.byteLength)
    const manifestOffset = STAGED_MAGIC_V2.byteLength + 4
    const senderLengthOffset = manifestOffset + encodedManifestBytes
    if (senderLengthOffset + 4 > plaintext.byteLength) throw new Error('Invalid staged email manifest')
    const embeddedManifest = EmailStagedManifestSchema.parse(JSON.parse(
      new TextDecoder().decode(plaintext.slice(manifestOffset, senderLengthOffset))
    ))
    if (JSON.stringify(embeddedManifest) !== JSON.stringify(expected)) {
      throw new Error('Staged email manifest mismatch')
    }
    const senderBytes = view.getUint32(senderLengthOffset)
    const senderOffset = senderLengthOffset + 4
    const rawOffset = senderOffset + senderBytes
    if (rawOffset > plaintext.byteLength) throw new Error('Invalid staged email')
    const sender = new TextDecoder().decode(plaintext.slice(senderOffset, rawOffset))
    return {
      format: 'sealed',
      raw: plaintext.slice(rawOffset),
      envelopeSender: sender || null,
      manifest: embeddedManifest
    }
  }
  const isLegacyStaged = STAGED_MAGIC_V1.every((byte, index) => plaintext[index] === byte)
  if (!isLegacyStaged) return { format: 'legacy', raw: plaintext, envelopeSender: null }
  if (plaintext.byteLength < STAGED_MAGIC_V1.byteLength + 4) throw new Error('Invalid staged email')
  const senderBytes = new DataView(
    plaintext.buffer,
    plaintext.byteOffset + STAGED_MAGIC_V1.byteLength,
    4
  ).getUint32(0)
  const rawOffset = STAGED_MAGIC_V1.byteLength + 4 + senderBytes
  if (rawOffset > plaintext.byteLength) throw new Error('Invalid staged email')
  return {
    format: 'legacy',
    raw: plaintext.slice(rawOffset),
    envelopeSender: null
  }
}
