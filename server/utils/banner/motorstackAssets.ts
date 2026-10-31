import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { bannerFontMimeType, isBannerFontBytes } from '~~/server/utils/banner/fontValidation'
import { validateBrandLogoResource } from '~~/server/utils/banner/websiteExtraction'
import { boundedMotorstackCall, motorstackKitSchema, readMotorstackAsset, type MotorstackBinding, type MotorstackKit } from './motorstackClient'

const EXTENSIONS: Record<string, string> = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' }
export function validMotorstackIcon(bytes: Buffer) {
  if (bytes.length < 22 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return false
  const count = bytes.readUInt16LE(4)
  if (!count || count > 64 || 6 + count * 16 > bytes.length) return false
  for (let index = 0; index < count; index++) {
    const at = 6 + index * 16
    const length = bytes.readUInt32LE(at + 8)
    const offset = bytes.readUInt32LE(at + 12)
    if (offset < 6 + count * 16 || length < 24 || offset + length > bytes.length) return false
    const image = bytes.subarray(offset, offset + length)
    const width = bytes[at] || 256
    const height = bytes[at + 1] || 256
    if (image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      if (image.subarray(12, 16).toString() !== 'IHDR' || image.readUInt32BE(16) !== width || image.readUInt32BE(20) !== height) return false
    } else {
      if (image.length < 40 || image.readUInt32LE(0) !== 40 || image.readInt32LE(4) !== width || image.readInt32LE(8) !== height * 2 || image.readUInt16LE(12) !== 1 || image.readUInt32LE(16) !== 0) return false
      const bits = image.readUInt16LE(14)
      if (![1, 4, 8, 24, 32].includes(bits)) return false
      const colors = image.readUInt32LE(32) || (bits <= 8 ? 2 ** bits : 0)
      if (colors > 256) return false
      const pixels = Math.ceil(width * bits / 32) * 4 * height
      const mask = Math.ceil(width / 32) * 4 * height
      if (40 + colors * 4 + pixels + mask > length) return false
    }
  }
  return true
}
export interface PreparedMotorstackAsset { sourceId: string, name: string, fileName: string, mimeType: string, bytes: Buffer, sha256: string, font?: { family: string, weight: number, format: string } }
export interface PreparedMotorstackBrand {
  metadata: MotorstackKit
  assets: PreparedMotorstackAsset[]
  fonts: Array<{ sourceIndex: number, assetKey: string }>
  logos: Array<{ sourceIndex: number, assetKey: string }>
  colors: Array<{ role: 'primary' | 'secondary' | 'accent' | 'background' | 'text' | 'extra', hex: string, label: string }>
  warnings: string[]
}
export function motorstackAssetKey(asset: Pick<PreparedMotorstackAsset, 'sourceId' | 'font'>) {
  return JSON.stringify([asset.sourceId, asset.font?.family ?? null, asset.font?.weight ?? null])
}
export async function prepareMotorstackBrand(binding: MotorstackBinding, brandId: string): Promise<PreparedMotorstackBrand> {
  const parsed = motorstackKitSchema.safeParse(await boundedMotorstackCall(binding.getBrandKit(brandId)))
  if (!parsed.success || parsed.data.brand.id !== brandId) throw createError({ statusCode: 502, statusMessage: 'MotorStack returned invalid brand metadata' })
  const metadata = parsed.data
  if (metadata.fonts.length > 8 || metadata.logos.length > 12 || metadata.colors.length > 24) throw createError({ statusCode: 422, statusMessage: 'MotorStack brand exceeds supported kit limits; no partial kit was saved' })
  if (new Set(metadata.assets.map(asset => asset.id)).size !== metadata.assets.length) throw createError({ statusCode: 502, statusMessage: 'MotorStack returned ambiguous asset identities' })
  const warnings = [...metadata.warnings]
  const assets: PreparedMotorstackAsset[] = []
  const fonts: PreparedMotorstackBrand['fonts'] = []
  const logos: PreparedMotorstackBrand['logos'] = []
  const fetched = new Map<string, { bytes: Buffer, mimeType: string }>()
  let bytesRead = 0
  const started = Date.now()
  const read = async (id: string, limit: number) => {
    if (Date.now() - started > 90000) throw createError({ statusCode: 504, statusMessage: 'MotorStack brand import exceeded the time limit; retry this brand' })
    if (!metadata.assets.some(asset => asset.id === id)) throw createError({ statusCode: 502, statusMessage: 'MotorStack role references an unavailable asset' })
    const existing = fetched.get(id)
    if (existing) {
      if (existing.bytes.length > limit) throw createError({ statusCode: 502, statusMessage: 'MotorStack role asset exceeds its size limit' })
      return existing
    }
    const result = await readMotorstackAsset(binding, brandId, id, limit)
    bytesRead += result.bytes.length
    if (bytesRead > 40 * 1024 * 1024) throw createError({ statusCode: 502, statusMessage: 'MotorStack brand exceeds the 40 MiB import limit' })
    fetched.set(id, result)
    return result
  }
  const add = (asset: Omit<PreparedMotorstackAsset, 'sha256'>) => {
    const key = motorstackAssetKey(asset)
    if (!assets.some(existing => motorstackAssetKey(existing) === key)) assets.push({ ...asset, sha256: createHash('sha256').update(asset.bytes).digest('hex') })
    return key
  }
  for (const [sourceIndex, font] of metadata.fonts.entries()) {
    if (!font.assetId || !font.file || !font.family.trim() || font.weight === null) {
      warnings.push(`${font.role}: ${font.family} has no available font file or declared weight; no substitute was assigned.`)
      continue
    }
    const fileName = font.file
    const mimeType = bannerFontMimeType(fileName)
    if (!fileName.length || fileName.length > 255 || /[/\\]/.test(fileName) || [...fileName].some(value => value.charCodeAt(0) < 32 || value.charCodeAt(0) === 127) || !mimeType) throw createError({ statusCode: 422, statusMessage: 'MotorStack font filename or format is unsupported; no partial kit was saved' })
    const file = await read(font.assetId, 5 * 1024 * 1024)
    if (!isBannerFontBytes(file.bytes, fileName)) throw createError({ statusCode: 502, statusMessage: 'MotorStack font bytes are invalid; no partial kit was saved' })
    const ext = fileName.split('.').pop()!.toLowerCase()
    const format = ext === 'ttf' ? 'truetype' : ext === 'otf' ? 'opentype' : ext
    const assetKey = add({ sourceId: font.assetId, name: font.family, fileName, mimeType, bytes: file.bytes, font: { family: font.family, weight: font.weight, format } })
    fonts.push({ sourceIndex, assetKey })
  }
  for (const [sourceIndex, logo] of metadata.logos.entries()) {
    if (!logo.assetId) {
      warnings.push(`${logo.role || logo.variant || 'Logo'} has no supported downloadable file and was omitted.`)
      continue
    }
    const file = await read(logo.assetId, 2 * 1024 * 1024)
    const extension = EXTENSIONS[file.mimeType]
    if (!extension) throw createError({ statusCode: 422, statusMessage: 'MotorStack logo format is unsupported; no partial kit was saved' })
    let bytes: Buffer
    if (extension === 'ico') {
      if (!validMotorstackIcon(file.bytes)) throw createError({ statusCode: 502, statusMessage: 'MotorStack icon bytes are invalid' })
      bytes = file.bytes
    } else {
      try {
        bytes = validateBrandLogoResource(file).bytes
      } catch {
        throw createError({ statusCode: 502, statusMessage: 'MotorStack logo contains invalid or unsafe content; no partial kit was saved' })
      }
    }
    const assetKey = add({ sourceId: logo.assetId, name: `${metadata.brand.name} ${logo.variant || logo.role}`.slice(0, 255), fileName: `motorstack-${logo.assetId}.${extension}`, mimeType: extension === 'ico' ? 'image/x-icon' : file.mimeType, bytes })
    logos.push({ sourceIndex, assetKey })
  }
  const colors: PreparedMotorstackBrand['colors'] = []
  for (const color of metadata.colors) {
    const short = /^#([a-f\d]{3})$/i.exec(color.value)
    const hex = short ? '#' + [...short[1]!].map(value => value + value).join('') : color.value
    if (!/^#[a-f\d]{6}$/i.test(hex)) {
      warnings.push(`Colour ${color.name} was not a supported hex value and was omitted.`)
      continue
    }
    const role = /^(primary|secondary|accent|background|text)(?:color|colour)?$/i.exec(color.name)?.[1]?.toLowerCase() as PreparedMotorstackBrand['colors'][number]['role'] | undefined
    colors.push({ role: role || 'extra', hex, label: color.name.slice(0, 60) })
  }
  if (!metadata.fonts.length) warnings.push('MotorStack provides no font metadata for this brand; no substitute was assigned.')
  return { metadata, assets, fonts, logos, colors, warnings: [...new Set(warnings)] }
}
