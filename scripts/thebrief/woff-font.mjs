import { deflateSync, inflateSync } from 'node:zlib'

const aligned = length => Math.ceil(length / 4) * 4
function checksum(bytes, head = false) {
  const padded = Buffer.alloc(aligned(bytes.length))
  bytes.copy(padded)
  if (head) padded.writeUInt32BE(0, 8)
  let sum = 0
  for (let offset = 0; offset < padded.length; offset += 4) sum = (sum + padded.readUInt32BE(offset)) >>> 0
  return sum
}

/** W3C WOFF 1.0 container only: no subsetting, table edits or glyph changes.
 * Reject anomalous SFNTs rather than repairing their checksums or signatures.
 * https://www.w3.org/TR/WOFF/#TableDirectory
 */
export function packSfntAsWoff(input) {
  if (!Buffer.isBuffer(input) || input.length < 12 || input.length > 32 * 1024 * 1024) throw new Error('Invalid bounded SFNT font')
  const flavor = input.readUInt32BE(0)
  if (![0x00010000, 0x4f54544f].includes(flavor)) throw new Error('Unsupported SFNT flavor')
  const count = input.readUInt16BE(4)
  const directoryEnd = 12 + count * 16
  if (count < 1 || count > 128 || directoryEnd > input.length) throw new Error('Invalid SFNT table count')
  const exponent = Math.floor(Math.log2(count))
  const searchRange = 2 ** exponent * 16
  if (input.readUInt16BE(6) !== searchRange || input.readUInt16BE(8) !== exponent || input.readUInt16BE(10) !== count * 16 - searchRange) throw new Error('Invalid SFNT search header')
  const tables = []
  for (let index = 0; index < count; index++) {
    const entry = 12 + index * 16
    const tag = input.readUInt32BE(entry)
    const offset = input.readUInt32BE(entry + 8)
    const length = input.readUInt32BE(entry + 12)
    if ((index && tag <= tables[index - 1].tag) || offset < directoryEnd || offset % 4 || !length || offset + aligned(length) > input.length) throw new Error('Invalid SFNT table directory')
    const bytes = input.subarray(offset, offset + length)
    const isHead = tag === 0x68656164
    if (isHead && length < 12) throw new Error('Invalid SFNT head table')
    const originalChecksum = input.readUInt32BE(entry + 4)
    if (checksum(bytes, isHead) !== originalChecksum) throw new Error('Invalid SFNT table checksum')
    const compressed = deflateSync(bytes, { level: 9 })
    tables.push({ tag, offset, length, originalChecksum, bytes, packed: compressed.length < length ? compressed : bytes })
  }
  // Exact source ordering and padding keep the original head/DSIG valid.
  let sourceOffset = directoryEnd
  const physicalOrder = [...tables].sort((a, b) => a.offset - b.offset)
  for (const table of physicalOrder) {
    if (table.offset !== sourceOffset || input.subarray(table.offset + table.length, table.offset + aligned(table.length)).some(byte => byte !== 0)) throw new Error('Noncanonical SFNT layout needs review')
    sourceOffset += aligned(table.length)
  }
  if (sourceOffset !== input.length || !tables.some(table => table.tag === 0x68656164) || checksum(input) !== 0xb1b0afba) throw new Error('Invalid SFNT overall checksum or layout')
  let outputOffset = 44 + count * 20
  for (const table of physicalOrder) {
    table.woffOffset = outputOffset
    outputOffset += aligned(table.packed.length)
  }
  const output = Buffer.alloc(outputOffset)
  output.writeUInt32BE(0x774f4646, 0)
  output.writeUInt32BE(flavor, 4)
  output.writeUInt32BE(output.length, 8)
  output.writeUInt16BE(count, 12)
  output.writeUInt32BE(input.length, 16)
  output.writeUInt16BE(1, 20)
  const restored = Buffer.from(input.subarray(0, directoryEnd))
  const decoded = [restored]
  for (let index = 0; index < count; index++) {
    const table = tables[index]
    const entry = 44 + index * 20
    output.writeUInt32BE(table.tag, entry)
    output.writeUInt32BE(table.woffOffset, entry + 4)
    output.writeUInt32BE(table.packed.length, entry + 8)
    output.writeUInt32BE(table.length, entry + 12)
    output.writeUInt32BE(table.originalChecksum, entry + 16)
    table.packed.copy(output, table.woffOffset)
  }
  // Independent decompression proves the complete font round-trip before use.
  for (const table of physicalOrder) {
    const bytes = output.subarray(table.woffOffset, table.woffOffset + table.packed.length)
    const uncompressed = bytes.length === table.length ? bytes : inflateSync(bytes, { maxOutputLength: table.length })
    const padded = Buffer.alloc(aligned(table.length))
    uncompressed.copy(padded)
    decoded.push(padded)
  }
  if (!Buffer.concat(decoded).equals(input)) throw new Error('Font round-trip differs from source')
  return output
}
