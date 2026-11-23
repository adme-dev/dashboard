import { isCurrentMotorstackOffer, motorstackOfferDateIssue } from '~~/shared/bannerMotorstackOffer'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createError, type H3Event } from 'h3'
import { getBrandKit } from '~~/server/utils/banner/brandKits'
import { requireBrandKitReadAccess } from '~~/server/utils/banner/brandKitAccess'
import { boundedMotorstackCall, motorstackBrandId, motorstackSourceUrl } from '~~/server/utils/banner/motorstackClient'

interface CatalogQuery { kitId: string, kind: 'variants' | 'offers' }
const label = z.string().min(1).max(255)
const amount = z.number().min(0).max(10_000_000).nullable()
const variantSchema = z.object({
  title: label.nullable(), model: label.nullable(), badge: label.nullable(), year: z.number().int().nullable(),
  driveawayPrice: amount, egcPrice: amount, priceScope: label.nullable(), priceDisclaimer: z.string().max(4000).nullable(),
  colours: z.array(z.object({ name: label.nullable(), hex: z.string().regex(/^#[a-f0-9]{6}$/i).nullable(), hasImage: z.boolean() })).max(100)
})
const offerSchema = z.object({
  title: label.nullable(), model: label.nullable(), variant: label.nullable(), price: amount, priceLabel: label.nullable(),
  offer: z.string().max(2000).nullable(), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  disclaimer: z.string().max(24000).nullable(), hasImage: z.boolean(),
  artworkAssetId: z.string().regex(/^[a-f0-9]{64}$/).nullable()
})
export type MotorstackCreativeOffer = z.infer<typeof offerSchema> & { id: string, current: boolean, verificationIssue: string | null, artworkPreviewUrl: string | null }
const catalogSchema = z.object({ schemaVersion: z.literal(1), brand: z.object({ id: motorstackBrandId, name: label }), kind: z.enum(['variants', 'offers']), updatedAt: z.string().max(50).nullable(), items: z.array(z.unknown()).max(500) })

interface CatalogBinding { listCreativeCatalog(input: { brandId: string, kind: 'variants' | 'offers' }): Promise<unknown> }

export async function getMotorstackCreativeCatalog(event: H3Event, input: CatalogQuery, projectClientId?: string | null) {
  const kit = await getBrandKit(input.kitId)
  if (!kit) throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })
  await requireBrandKitReadAccess(event, kit.clientId)
  if (projectClientId !== undefined && kit.clientId && kit.clientId !== projectClientId) throw createError({ statusCode: 403, statusMessage: 'Brand kit is outside this project client' })
  const sourceUrl = typeof kit.sourceUrl === 'string' ? kit.sourceUrl : ''
  const brandId = sourceUrl.match(/^https:\/\/oem-variants\.pages\.dev\/api\/mcp#brand=([a-z0-9-]{1,40})$/)?.[1]
  if (!brandId || sourceUrl !== motorstackSourceUrl(brandId)) throw createError({ statusCode: 422, statusMessage: 'This kit is not linked to a MotorStack brand' })
  const binding = event.context.cloudflare?.env?.MOTORSTACK_BRAND_ASSETS as CatalogBinding | undefined
  if (typeof binding?.listCreativeCatalog !== 'function') throw createError({ statusCode: 503, statusMessage: 'MotorStack variants and offers are not configured on this deployment' })
  const response = catalogSchema.safeParse(await boundedMotorstackCall(binding.listCreativeCatalog({ brandId, kind: input.kind }), 45000))
  if (!response.success || response.data.brand.id !== brandId || response.data.kind !== input.kind) throw createError({ statusCode: 502, statusMessage: 'MotorStack returned invalid catalogue metadata' })
  const items = z.array(input.kind === 'variants' ? variantSchema : offerSchema).safeParse(response.data.items)
  if (!items.success) throw createError({ statusCode: 502, statusMessage: 'MotorStack returned invalid catalogue items' })
  if (input.kind === 'offers') {
    const offers = items.data as z.infer<typeof offerSchema>[]
    return { ...response.data, kit, items: offers.map(item => ({
      ...item, current: isCurrentMotorstackOffer(item.endDate) && !motorstackOfferDateIssue(item.endDate, item.disclaimer),
      verificationIssue: motorstackOfferDateIssue(item.endDate, item.disclaimer), id: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
      artworkPreviewUrl: item.artworkAssetId
        ? `/api/agency/banner-studio/motorstack/file?${new URLSearchParams({ brandId, assetId: item.artworkAssetId })}`
        : null
    })) }
  }
  return { ...response.data, kit, items: items.data }
}
