/**
 * AES-256-GCM token encryption using Web Crypto (Node + CF Workers).
 *
 * Generate a key locally:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Set REPO_TOKEN_ENCRYPTION_KEY in .env (local) and:
 *   wrangler pages secret put REPO_TOKEN_ENCRYPTION_KEY (production)
 *
 * Returns Uint8Array everywhere (not Buffer) so the module is portable
 * across Cloudflare runtimes that don't have node:buffer enabled.
 * Postgres' `pg` driver accepts Uint8Array for bytea bindings.
 */

const ALG = 'AES-GCM'
const IV_LENGTH = 12 // 96-bit IV recommended for GCM
const KEY_LENGTH_BYTES = 32 // 256-bit key

let _cachedKey: CryptoKey | null = null

function base64ToBytes(b64: string): Uint8Array {
  // atob is available in Node 18+ and CF Workers.
  const binStr = atob(b64)
  const bytes = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
  return bytes
}

function toUint8(input: Uint8Array | ArrayBuffer): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input)
}

async function getKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey

  const keyB64 = process.env.REPO_TOKEN_ENCRYPTION_KEY
  if (!keyB64) {
    throw new Error(
      'REPO_TOKEN_ENCRYPTION_KEY is not set. '
      + 'Generate one with `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"`',
    )
  }

  const keyBytes = base64ToBytes(keyB64)
  if (keyBytes.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `REPO_TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes (got ${keyBytes.length})`,
    )
  }

  _cachedKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    ALG,
    false,
    ['encrypt', 'decrypt'],
  )
  return _cachedKey
}

export interface EncryptedToken {
  ciphertext: Uint8Array
  iv: Uint8Array
}

export async function encryptToken(plaintext: string): Promise<EncryptedToken> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const data = new TextEncoder().encode(plaintext)
  const ct = await crypto.subtle.encrypt({ name: ALG, iv }, key, data)
  return { ciphertext: new Uint8Array(ct), iv }
}

export async function decryptToken(
  ciphertext: Uint8Array | ArrayBuffer,
  iv: Uint8Array | ArrayBuffer,
): Promise<string> {
  const key = await getKey()
  const ctBytes = toUint8(ciphertext)
  const ivBytes = toUint8(iv)
  const decrypted = await crypto.subtle.decrypt(
    { name: ALG, iv: ivBytes as BufferSource },
    key,
    ctBytes as BufferSource,
  )
  return new TextDecoder().decode(decrypted)
}
