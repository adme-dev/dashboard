import { createError } from 'h3'
import { z } from 'zod'
import type { DissectionPhysical } from '../../../shared/bannerDissectionIngestion'

interface UploadPart { name?: string, filename?: string, type?: string, data: Buffer }
const id = z.string().uuid().transform(value => value.toLowerCase())
const physicalIntent = z.object({ preset: z.literal('A4'), orientation: z.enum(['portrait', 'landscape']) }).strict()
const fields = new Set(['file', 'brand', 'projectId', 'clientId', 'physical'])
function invalid(message = 'Invalid dissection upload fields'): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

/** Multipart values express intent only; ownership is resolved from fresh rows later. */
export function parseDissectionUploadParts(parts: UploadPart[] | undefined) {
  if (!Array.isArray(parts) || !parts.length) invalid('No file uploaded')
  const seen = new Map<string, UploadPart>()
  let metadataBytes = 0
  for (const part of parts) {
    if (!part.name || !fields.has(part.name) || seen.has(part.name) || !Buffer.isBuffer(part.data)) invalid()
    if (part.name !== 'file') {
      if (part.filename !== undefined) invalid()
      metadataBytes += part.data.length
      if (metadataBytes > 16 * 1024) invalid('Upload metadata exceeds 16 KiB')
    }
    seen.set(part.name, part)
  }
  const file = seen.get('file')
  if (!file || !file.type) invalid('Missing file field')
  const read = (name: string) => seen.get(name)?.data.toString('utf8')
  const brand = read('brand') || ''
  if (brand.length > 200 || brand.includes('\0')) invalid('Brand must be at most 200 characters')
  function optionalId(name: string) {
    if (!seen.has(name)) return undefined
    const parsed = id.safeParse(read(name))
    if (!parsed.success) invalid()
    return parsed.data
  }
  let physical: DissectionPhysical | null = null
  if (seen.has('physical')) {
    let raw: unknown
    try {
      raw = JSON.parse(read('physical')!)
    } catch {
      invalid('Invalid physical format')
    }
    const parsed = physicalIntent.safeParse(raw)
    if (!parsed.success) invalid('Invalid physical format')
    const { orientation } = parsed.data
    physical = { preset: 'A4', orientation, unit: 'mm', widthMm: orientation === 'portrait' ? 210 : 297, heightMm: orientation === 'portrait' ? 297 : 210 }
  }
  return { file: { ...file, type: file.type }, brand, projectId: optionalId('projectId'), clientId: optionalId('clientId'), physical }
}
