/** Read source headers without decoding or resizing the artwork. */
export function sourceImageDimensions(data: Buffer): { width: number, height: number } | null {
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return valid(data.readUInt32BE(16), data.readUInt32BE(20))
  }
  if (data.length >= 10 && data[0] === 255 && data[1] === 216) {
    let offset = 2
    while (offset + 9 < data.length) {
      if (data[offset] !== 255) {
        offset++
        continue
      }
      const marker = data[offset + 1]!
      if (marker === 192 || marker === 194) return valid(data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5))
      if (marker === 217 || marker === 218) break
      const size = data.readUInt16BE(offset + 2)
      if (size < 2) break
      offset += 2 + size
    }
  }
  return null
}
function valid(width: number, height: number) {
  return width > 0 && height > 0 ? { width, height } : null
}
export function sourceAspectRatio(width: number, height: number): string {
  let a = width, b = height
  while (b) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return `${width / a}:${height / a}`
}
