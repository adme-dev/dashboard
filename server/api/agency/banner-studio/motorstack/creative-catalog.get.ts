import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getBrandKit } from '~~/server/utils/banner/brandKits'
import { requireBrandKitReadAccess } from '~~/server/utils/banner/brandKitAccess'
import { boundedMotorstackCall, motorstackBrandId, motorstackSourceUrl } from '~~/server/utils/banner/motorstackClient'

const querySchema = z.object({ kitId: z.string().uuid(), kind: z.enum(['variants', 'offers']) }).strict()
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
  disclaimer: z.string().max(12000).nullable(), hasImage: z.boolean()
})
const catalogSchema = z.object({ schemaVersion: z.literal(1), brand: z.object({ id: motorstackBrandId, name: label }), kind: z.enum(['variants', 'offers']), updatedAt: z.string().max(50).nullable(), items: z.array(z.unknown()).max(500) })

interface CatalogBinding { listCreativeCatalog(input: { brandId: string, kind: 'variants' | 'offers' }): Promise<unknown> }

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const input = querySchema.safeParse(getQuery(event))
  if (!input.success) throw createError({ statusCode: 400, statusMessage: 'Choose a valid brand kit and catalogue' })
  const kit = await getBrandKit(input.data.kitId)
  if (!kit) throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })
  await requireBrandKitReadAccess(event, kit.clientId)
  const sourceUrl = typeof kit.sourceUrl === 'string' ? kit.sourceUrl : ''
  const brandId = sourceUrl.match(/^https:\/\/oem-variants\.pages\.dev\/api\/mcp#brand=([a-z0-9-]{1,40})$/)?.[1]
  if (!brandId || sourceUrl !== motorstackSourceUrl(brandId)) throw createError({ statusCode: 422, statusMessage: 'This kit is not linked to a MotorStack brand' })
  const binding = event.context.cloudflare?.env?.MOTORSTACK_BRAND_ASSETS as CatalogBinding | undefined
  if (typeof binding?.listCreativeCatalog !== 'function') throw createError({ statusCode: 503, statusMessage: 'MotorStack variants and offers are not configured on this deployment' })
  const response = catalogSchema.safeParse(await boundedMotorstackCall(binding.listCreativeCatalog({ brandId, kind: input.data.kind }), 45000))
  if (!response.success || response.data.brand.id !== brandId || response.data.kind !== input.data.kind) throw createError({ statusCode: 502, statusMessage: 'MotorStack returned invalid catalogue metadata' })
  const items = z.array(input.data.kind === 'variants' ? variantSchema : offerSchema).safeParse(response.data.items)
  if (!items.success) throw createError({ statusCode: 502, statusMessage: 'MotorStack returned invalid catalogue items' })
  return { ...response.data, items: items.data }
})
