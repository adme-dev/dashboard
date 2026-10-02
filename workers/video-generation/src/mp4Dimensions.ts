/** Read display dimensions from a video track's tkhd box without decoding video. */
export function mp4Dimensions(bytes: ArrayBuffer): { width: number; height: number; aspectRatio: string } | null {
  const view = new DataView(bytes)
  function scan(start: number, end: number, depth: number): { width: number; height: number } | null {
    if (depth > 4) return null
    for (let offset = start; offset + 8 <= end;) {
      let size = view.getUint32(offset)
      const type = String.fromCharCode(...new Uint8Array(bytes, offset + 4, 4))
      let header = 8
      if (size === 1) {
        if (offset + 16 > end) return null
        size = Number(view.getBigUint64(offset + 8))
        header = 16
      } else if (size === 0) size = end - offset
      if (!Number.isSafeInteger(size) || size < header || offset + size > end) return null
      if (type === 'tkhd' && size >= header + 84) {
        const width = Math.round(view.getUint32(offset + size - 8) / 65536)
        const height = Math.round(view.getUint32(offset + size - 4) / 65536)
        if (width > 0 && height > 0) return { width, height }
      }
      if (type === 'moov' || type === 'trak') {
        const found = scan(offset + header, offset + size, depth + 1)
        if (found) return found
      }
      offset += size
    }
    return null
  }
  const result = scan(0, bytes.byteLength, 0)
  if (!result) return null
  let a = result.width
  let b = result.height
  while (b) [a, b] = [b, a % b]
  return { ...result, aspectRatio: `${result.width / a}:${result.height / a}` }
}
