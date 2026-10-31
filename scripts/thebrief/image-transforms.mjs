import sharp from 'sharp'

/** Bake only the verified reflection; retain static filters as bounded CSS. */
export async function transformImage(bytes, operations) {
  if (!operations.length) return bytes
  if (operations.length !== 1 || operations[0].operation !== 'flop') throw new Error('Unsupported image operation')
  return sharp(bytes, { limitInputPixels: 4096 * 4096 }).flop().png().toBuffer()
}
