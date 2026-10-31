import { createError, H3Error, type H3Event } from 'h3'
import { z } from 'zod'

export const motorstackBrandId = z.string().regex(/^[a-z0-9-]{1,40}$/)
const label = z.string().min(1).max(255)
const assetId = z.string().regex(/^[a-f0-9]{64}$/)
const brand = z.object({ id: motorstackBrandId, name: label })
const mime = z.string().min(1).max(100)
export const motorstackListSchema = z.object({ schemaVersion: z.literal(1), brands: z.array(brand).max(200) })
export const motorstackKitSchema = z.object({
  schemaVersion: z.literal(1), brand,
  logos: z.array(z.object({ assetId: assetId.nullable(), role: z.string().max(255), variant: z.string().max(255), name: label, mime: mime.nullable(), file: z.string().max(255).nullable(), onDark: z.boolean().nullable() })).max(100),
  fonts: z.array(z.object({ role: label, family: z.string().max(120), weight: z.number().int().min(1).max(1000).nullable(), sourceWeight: z.union([z.string().max(100), z.number()]).nullable(), assetId: assetId.nullable(), file: z.string().max(255).nullable() })).max(100),
  colors: z.array(z.object({ name: label, value: z.string().max(100) })).max(100),
  assets: z.array(z.object({ id: assetId, name: label, type: z.string().max(100), mime })).max(200),
  warnings: z.array(z.string().max(1000)).max(100)
})
export type MotorstackKit = z.infer<typeof motorstackKitSchema>
export interface MotorstackBinding {
  listBrands(): Promise<unknown>
  getBrandKit(id: string): Promise<unknown>
  getBrandAsset(input: { brandId: string, assetId: string }): Promise<Response>
}
export function motorstackBinding(event: H3Event): MotorstackBinding {
  const binding = event.context.cloudflare?.env?.MOTORSTACK_BRAND_ASSETS as MotorstackBinding | undefined
  if (!binding || typeof binding.listBrands !== 'function' || typeof binding.getBrandKit !== 'function' || typeof binding.getBrandAsset !== 'function') {
    throw createError({ statusCode: 503, statusMessage: 'MotorStack brand assets are not configured on this deployment' })
  }
  return binding
}
export async function boundedMotorstackCall<T>(work: Promise<T>, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(createError({ statusCode: 504, statusMessage: 'MotorStack request timed out; retry this brand' })), milliseconds)
    })])
  } catch (error) {
    // Only locally constructed HTTP errors retain their status/message. RPC errors
    // are remote input and must never expose provider payloads, URLs or credentials.
    if (error instanceof H3Error) throw error
    const code = error instanceof Error ? error.message : ''
    let statusCode = 502
    let statusMessage = 'MotorStack could not complete the request. Retry; if it continues, ask an administrator to check the connection.'
    if (code === 'motorstack_not_configured') {
      statusCode = 503
      statusMessage = 'MotorStack is not configured. Ask an administrator to check the connection, then retry.'
    } else if (code === 'motorstack_unavailable') {
      statusMessage = 'MotorStack is temporarily unavailable. Retry; if it continues, ask an administrator to check the connection.'
    } else if (['asset_not_found', 'asset_unavailable', 'brand_not_available'].includes(code)) {
      statusMessage = 'The MotorStack brand or asset is unavailable. Retry this brand; if it continues, check the source files in MotorStack.'
    } else if (['asset_host_not_supported', 'asset_redirect_refused', 'asset_type_refused', 'provider_response_too_large'].includes(code)) {
      statusMessage = 'The MotorStack asset could not be safely imported. Check its source file, then retry this brand.'
    }
    throw createError({ statusCode, statusMessage })
  } finally { clearTimeout(timer) }
}
export function motorstackSourceUrl(id: string) {
  // API provenance identifier; the fragment names the source tool's brand argument.
  return `https://oem-variants.pages.dev/api/mcp#brand=${encodeURIComponent(motorstackBrandId.parse(id))}`
}
/** Bound the stream independently of upstream Content-Length. Never fetch a supplied URL. */
export async function readMotorstackAsset(binding: MotorstackBinding, brandId: string, id: string, limit: number) {
  const response = await boundedMotorstackCall(binding.getBrandAsset({ brandId, assetId: id }))
  const contentType = (response.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase()
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel()
    throw createError({ statusCode: 502, statusMessage: 'MotorStack asset is unavailable or exceeds the size limit; retry this brand' })
  }
  const reader = response.body.getReader()
  try {
    return await boundedMotorstackCall((async () => {
      const chunks: Uint8Array[] = []
      let length = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > limit) throw createError({ statusCode: 502, statusMessage: 'MotorStack asset exceeds the size limit' })
        chunks.push(value)
      }
      if (!length) throw createError({ statusCode: 502, statusMessage: 'MotorStack asset is empty' })
      return { bytes: Buffer.concat(chunks, length), mimeType: contentType }
    })())
  } finally { await reader.cancel().catch(() => undefined) }
}
