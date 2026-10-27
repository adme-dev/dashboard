import { Buffer } from 'node:buffer'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { PNG } from 'pngjs'
import { BannerRenderError, BANNER_RENDER_LIMITS as L } from '../../../shared/bannerRenderContract'

export function encodedDimensions(bytes: Uint8Array, output: 'png' | 'jpeg' | 'gif'): {
  width: number
  height: number
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (output === 'png' && bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR')
    return { width: view.getUint32(16), height: view.getUint32(20) }
  if (output === 'gif' && bytes.length >= 13 && /^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0, 6))))
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  if (output === 'jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255)
        break
      while (bytes[offset] === 255)
        offset++
      const marker = bytes[offset++]
      if (marker === 217 || marker === 218)
        break
      const size = view.getUint16(offset)
      if (size < 2 || offset + size > bytes.length)
        break
      if ([192, 193, 194].includes(marker) && size >= 7)
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) }
      offset += size
    }
  }
  throw new BannerRenderError('RENDER_FAILED')
}
export function gifEncoder(width: number, height: number, delay: number) {
  const gif = GIFEncoder()
  return {
    frame(bytes: Uint8Array) {
      const dimensions = encodedDimensions(bytes, 'png')
      if (dimensions.width !== width || dimensions.height !== height || bytes.length > L.MAX_ITEM_OUTPUT_BYTES)
        throw new BannerRenderError('RENDER_FAILED')
      const png = PNG.sync.read(Buffer.from(bytes), { checkCRC: true })
      const palette = quantize(png.data, 256)
      const index = applyPalette(png.data, palette)
      gif.writeFrame(index, width, height, { palette, delay, repeat: 0 })
      if (gif.bytesView().byteLength > L.MAX_ITEM_OUTPUT_BYTES)
        throw new BannerRenderError('LIMIT_EXCEEDED')
    },
    finish(): Uint8Array {
      gif.finish()
      return gif.bytes()
    }
  }
}
