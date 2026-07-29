const MIN_SECRET_BYTES = 32
const MAX_SECRET_CHARACTERS = 4096
const MIN_DISTINCT_BYTES = 16
const MIN_EMPIRICAL_ENTROPY_BITS = 4
const MAX_SINGLE_BYTE_FRACTION = 0.25

const PLACEHOLDER_MARKERS = [
  'changeme',
  'default',
  'dummy',
  'example',
  'insecure',
  'password',
  'placeholder',
  'replace',
  'secret',
  'secretkey',
  'testonly',
  'yourkey',
  'yoursecret'
] as const

function decodeHex(value: string): Uint8Array | null {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) return null
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16)
  }
  return bytes
}

function decodeBase64(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return null
  const unpadded = value.replace(/=+$/, '')
  if (unpadded.length % 4 === 1) return null
  const symbolFrequencies = new Map<string, number>()
  for (const symbol of unpadded) {
    symbolFrequencies.set(symbol, (symbolFrequencies.get(symbol) ?? 0) + 1)
  }
  const symbolEntropy = [...symbolFrequencies.values()].reduce((total, count) => {
    const probability = count / unpadded.length
    return total - probability * Math.log2(probability)
  }, 0)
  if (symbolFrequencies.size < 20 || symbolEntropy < 4.25) return null
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  let accumulator = 0
  let bitCount = 0
  for (const character of unpadded.replaceAll('-', '+').replaceAll('_', '/')) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) return null
    accumulator = (accumulator << 6) | digit
    bitCount += 6
    if (bitCount >= 8) {
      bitCount -= 8
      bytes.push((accumulator >> bitCount) & 0xff)
      accumulator &= (1 << bitCount) - 1
    }
  }
  if (bitCount > 0 && accumulator !== 0) return null
  return Uint8Array.from(bytes)
}

function normalizedText(bytes: Uint8Array): string | null {
  if (bytes.some(byte => byte < 0x20 || byte > 0x7e)) return null
  return String.fromCharCode(...bytes).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isPeriodic(bytes: Uint8Array): boolean {
  for (let period = 1; period <= Math.min(16, Math.floor(bytes.length / 2)); period++) {
    if (bytes.every((byte, index) => byte === bytes[index % period])) return true
  }
  return false
}

function hasSufficientDiversity(bytes: Uint8Array): boolean {
  const frequencies = new Map<number, number>()
  for (const byte of bytes) frequencies.set(byte, (frequencies.get(byte) ?? 0) + 1)
  if (frequencies.size < MIN_DISTINCT_BYTES) return false
  if (Math.max(...frequencies.values()) / bytes.length > MAX_SINGLE_BYTE_FRACTION) return false
  const entropy = [...frequencies.values()].reduce((total, count) => {
    const probability = count / bytes.length
    return total - probability * Math.log2(probability)
  }, 0)
  return entropy >= MIN_EMPIRICAL_ENTROPY_BITS
}

/**
 * Accepts generated secret material encoded as hex, base64, or base64url.
 * This cannot prove how a value was generated, so it fail-closes common
 * placeholder, repetition, and low-diversity configurations.
 */
export function isStrongEmailSecret(value: unknown): value is string {
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.length > MAX_SECRET_CHARACTERS
  ) {
    return false
  }
  const rawText = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (PLACEHOLDER_MARKERS.some(marker => rawText.includes(marker))) return false
  const bytes = decodeHex(value) ?? decodeBase64(value)
  if (!bytes || bytes.length < MIN_SECRET_BYTES) return false
  const text = normalizedText(bytes)
  if (text && PLACEHOLDER_MARKERS.some(marker => text.includes(marker))) return false
  return !isPeriodic(bytes) && hasSufficientDiversity(bytes)
}
