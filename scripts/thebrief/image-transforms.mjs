import sharp from 'sharp'

/** Bake only a verified horizontal (flop) or vertical (flip) reflection; retain static filters as bounded CSS. */
export async function transformImage(bytes, operations) {
  if (!operations.length) return bytes
  if (operations.length !== 1 || !['flop', 'flip', 'rotate180'].includes(operations[0].operation)) throw new Error('Unsupported image operation')
  const image = sharp(bytes, { limitInputPixels: 4096 * 4096 })
  if (operations[0].operation === 'rotate180') return image.rotate(180).png().toBuffer()
  return (operations[0].operation === 'flop' ? image.flop() : image.flip()).png().toBuffer()
}
