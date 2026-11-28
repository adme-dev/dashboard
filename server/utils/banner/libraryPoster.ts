import jpeg from 'jpeg-js'
import { readPictureSize } from '~~/workers/asset-intelligence/src/imageCodec'
import { resizeImage } from '~~/workers/asset-intelligence/src/eraseComposite'

/** Derive both library variants from the same saved frame, including older proof JPEGs. */
export function fitLibraryPoster(bytes: ArrayBuffer, maxSide: 160 | 480): ArrayBuffer {
  const size = readPictureSize(new Uint8Array(bytes))
  if (!size || Math.max(size.width, size.height) <= maxSide) return bytes
  const scale = maxSide / Math.max(size.width, size.height)
  const image = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 2, maxMemoryUsageInMB: 48 })
  const resized = resizeImage(image, Math.max(1, Math.round(size.width * scale)), Math.max(1, Math.round(size.height * scale)))
  return Uint8Array.from(jpeg.encode(resized, 82).data).buffer
}
