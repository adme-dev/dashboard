const encoder = new TextEncoder()
const MAGIC = new Uint8Array([0x58, 0x45, 0x4c, 0x31])
const SALT_BYTES = 16
const IV_BYTES = 12
const HEADER_BYTES = MAGIC.byteLength + SALT_BYTES + IV_BYTES

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  if (secret.length < 16 || secret.length > 4096) throw new Error('Quarantine encryption secret is unavailable')
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey'])
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
  for (let index = 0; index < first.length; index++) difference |= first[index]! ^ second[index]!
  return difference === 0
}

export async function encryptRawEmail(raw: Uint8Array, secret: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(secret, salt)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
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

export async function decryptRawEmail(encrypted: Uint8Array, secret: string): Promise<Uint8Array> {
  if (encrypted.byteLength <= HEADER_BYTES + 16) throw new Error('Invalid encrypted email')
  for (let index = 0; index < MAGIC.byteLength; index++) {
    if (encrypted[index] !== MAGIC[index]) throw new Error('Invalid encrypted email')
  }
  const salt = encrypted.slice(MAGIC.byteLength, MAGIC.byteLength + SALT_BYTES)
  const iv = encrypted.slice(MAGIC.byteLength + SALT_BYTES, HEADER_BYTES)
  const key = await deriveKey(secret, salt)
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted.slice(HEADER_BYTES)
  ))
}

export function encryptedRawEmailPutOptions(
  expiresAt: string,
  correlationId: string
): R2PutOptions {
  return {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { schemaVersion: '1', expiresAt, correlationId }
  }
}

export async function putEncryptedRawEmail(
  bucket: R2Bucket,
  objectKey: string,
  encrypted: Uint8Array,
  options: R2PutOptions
): Promise<void> {
  await bucket.put(objectKey, encrypted, options)
}

export async function deleteEncryptedRawEmail(bucket: R2Bucket, objectKey: string): Promise<void> {
  await bucket.delete(objectKey)
}
