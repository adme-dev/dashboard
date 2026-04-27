/**
 * AES-256-GCM token encryption using Web Crypto (works on Node + CF Workers).
 *
 * Generate a key locally:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Set REPO_TOKEN_ENCRYPTION_KEY in .env (local) and via
 *   wrangler pages secret put REPO_TOKEN_ENCRYPTION_KEY (production)
 */

const ALG = 'AES-GCM'
const IV_LENGTH = 12 // 96-bit IV recommended for GCM
const KEY_LENGTH_BYTES = 32 // 256-bit key

let _cachedKey: CryptoKey | null = null

async function getKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey

  const keyB64 = process.env.REPO_TOKEN_ENCRYPTION_KEY
  if (!keyB64) {
    throw new Error('REPO_TOKEN_ENCRYPTION_KEY is not set')
  }

  const keyBytes = Uint8Array.from(Buffer.from(keyB64, 'base64'))
  if (keyBytes.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `REPO_TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes (got ${keyBytes.length})`,
    )
  }

  _cachedKey = await crypto.subtle.importKey('raw', keyBytes, ALG, false, ['encrypt', 'decrypt'])
  return _cachedKey
}

export async function encryptToken(plaintext: string): Promise<{
  ciphertext: Buffer
  iv: Buffer
}> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const data = new TextEncoder().encode(plaintext)
  const ct = await crypto.subtle.encrypt({ name: ALG, iv }, key, data)
  return {
    ciphertext: Buffer.from(new Uint8Array(ct)),
    iv: Buffer.from(iv),
  }
}

export async function decryptToken(ciphertext: Buffer, iv: Buffer): Promise<string> {
  const key = await getKey()
  const decrypted = await crypto.subtle.decrypt(
    { name: ALG, iv: new Uint8Array(iv) },
    key,
    new Uint8Array(ciphertext),
  )
  return new TextDecoder().decode(decrypted)
}
