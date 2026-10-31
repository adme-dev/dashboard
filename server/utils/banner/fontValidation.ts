/** Font MIME types are server-owned; multipart and stored metadata are untrusted. */
export function bannerFontMimeType(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ({ ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' } as Record<string, string>)[ext || ''] || null
}

/** Check container identity and minimum header bounds before accepting font bytes. */
export function isBannerFontBytes(bytes: Uint8Array, filename: string): boolean {
  const mime = bannerFontMimeType(filename)
  if (!mime || bytes.byteLength < 12) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = view.getUint32(0)
  if (mime === 'font/ttf' || mime === 'font/otf') {
    // Both extensions carry SFNT fonts; TheBrief exports CFF/OTTO as .ttf.
    if (magic !== 0x00010000 && magic !== 0x4f54544f) return false
    const tables = view.getUint16(4)
    if (!tables || 12 + tables * 16 > bytes.byteLength) return false
    for (let index = 0; index < tables; index++) {
      const offset = view.getUint32(12 + index * 16 + 8)
      const length = view.getUint32(12 + index * 16 + 12)
      if (offset < 12 + tables * 16 || offset + length > bytes.byteLength) return false
    }
    return true
  }
  const isWoff2 = mime === 'font/woff2'
  const headerSize = isWoff2 ? 48 : 44
  if (bytes.byteLength < headerSize || magic !== (isWoff2 ? 0x774f4632 : 0x774f4646)) return false
  const flavor = view.getUint32(4)
  return (flavor === 0x00010000 || flavor === 0x4f54544f)
    && view.getUint32(8) === bytes.byteLength
    && view.getUint16(12) > 0 && view.getUint16(14) === 0
    && view.getUint32(16) >= 12
}
