import sharp from 'sharp'

/** Bake only a verified horizontal (flop) or vertical (flip) reflection; retain static filters as bounded CSS. */
export async function transformImage(bytes, operations) {
  if (!operations.length) return bytes
  if (operations.length !== 1 || !['flop', 'flip'].includes(operations[0].operation)) throw new Error('Unsupported image operation')
  const image = sharp(bytes, { limitInputPixels: 4096 * 4096 })
  return (operations[0].operation === 'flop' ? image.flop() : image.flip()).png().toBuffer()
}
