import { readFileSync, writeFileSync } from 'node:fs'
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib'
import { createHash } from 'node:crypto'
const [destination, maximum, reuse] = process.argv.slice(2)
const limit = Number(maximum)
if (!destination || !Number.isSafeInteger(limit) || limit < 1) throw Error('Invalid destination/limit')
const raw = readFileSync(0)
const encoded = reuse ? readFileSync(reuse) : brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
if (encoded.length >= limit) throw Error('Compressed asset exceeds strict file limit')
if (!brotliDecompressSync(encoded).equals(raw)) throw Error('Brotli roundtrip mismatch')
writeFileSync(destination, encoded, { flag: 'wx' })
const sha = data => createHash('sha256').update(data).digest('hex')
process.stdout.write(JSON.stringify({ quality: 11, encoded_bytes: encoded.length, decoded_bytes: raw.length, encoded_sha256: sha(encoded), decoded_sha256: sha(raw), roundtrip_verified: true }))
