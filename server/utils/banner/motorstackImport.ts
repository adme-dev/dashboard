import { createError, type H3Event } from 'h3'
import { queryRowsFresh, transactionWithoutRetry, getTransactionFailureStage } from '~~/server/utils/db'
import { getAppUrl } from '~~/server/utils/appUrl'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'
import { validateBrandKitFontAssets } from '~~/server/utils/banner/fontAssets'
import { brandKitInputSchema } from '~~/server/utils/banner/brandKits'
import { bannerAssetDeliveryUrl, createBannerAssetId, createBannerAssetStorageKey, deleteBannerFile, uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { boundedMotorstackCall, motorstackListSchema, motorstackSourceUrl, type MotorstackBinding } from './motorstackClient'
import { motorstackAssetKey, prepareMotorstackBrand, type PreparedMotorstackBrand } from './motorstackAssets'
import { brandGuideText } from '~~/shared/bannerBrandGuides'

interface ExistingKit { id: string, name: string, source_url: string, fonts: Array<{ assets?: Array<{ id: string }> }>, logos: unknown[], colors: unknown[], guidelines: string | null }
export interface MotorstackImportResult {
  status: 'imported' | 'existing' | 'skipped'
  brandId: string
  brandName: string
  kitId: string | null
  warnings: string[]
  counts: { fonts: number, logos: number, colors: number }
}
const EXISTING_SELECT = 'id, name, source_url, fonts, logos, colors, guidelines'
function motorstackSourceNotes(prepared: PreparedMotorstackBrand) {
  const { metadata, warnings } = prepared
  const lines = [
    'MotorStack source notes',
    `Brand: ${metadata.brand.name}`,
    'Use the declared font weights below. Numbers in filenames do not determine the weight.',
    'The source medium font is available under the extra font role.',
    '', 'Fonts:'
  ]
  for (const font of metadata.fonts) lines.push(`- ${font.role}: ${font.family || 'Family not supplied'}; declared weight: ${font.sourceWeight ?? 'not supplied'}; file: ${font.file || 'not supplied'}${!font.assetId ? '; unavailable' : ''}.`)
  if (!metadata.fonts.length) lines.push('- No font details supplied.')
  lines.push('', 'Logos:')
  for (const logo of metadata.logos) lines.push(`- ${logo.role || 'Unspecified role'}${logo.variant ? ` (${logo.variant})` : ''}: ${logo.file || logo.name}; ${logo.onDark === true ? 'for dark backgrounds' : logo.onDark === false ? 'for light backgrounds' : 'background use not specified'}${!logo.assetId ? '; unavailable' : ''}.`)
  if (!metadata.logos.length) lines.push('- No logos supplied.')
  lines.push('', 'Colours:')
  for (const color of metadata.colors) lines.push(`- ${color.name}: ${color.value}.`)
  if (!metadata.colors.length) lines.push('- No colours supplied.')
  const guide = brandGuideText(metadata.brand.id)
  if (guide) lines.push('', guide)
  lines.push('', 'Import warnings:', ...(warnings.length ? warnings.map(warning => `- ${warning}`) : ['None.']))
  return lines.join('\n')
}
function existingResult(brandId: string, kit: ExistingKit): MotorstackImportResult {
  let warnings: string[] = []
  try {
    const provenance = JSON.parse(kit.guidelines || '')
    if (provenance.provider === 'MotorStack' && Array.isArray(provenance.warnings)) warnings = provenance.warnings.filter((value: unknown): value is string => typeof value === 'string').slice(0, 100)
  } catch {
    // Read our human-readable warning section, while retaining any user edits verbatim.
    const notes = kit.guidelines || ''
    if (notes.startsWith('MotorStack source notes\n')) {
      const section = notes.split('\nImport warnings:\n')[1]?.split('\n\n')[0] || ''
      warnings = section.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2)).filter(Boolean).slice(0, 100)
    }
  }
  return { status: 'existing', brandId, brandName: kit.name, kitId: kit.id, warnings: [...warnings, 'The existing shared source kit was retained without changes.'], counts: {
    fonts: new Set((kit.fonts || []).flatMap(font => font.assets?.map(asset => asset.id) || [])).size,
    logos: kit.logos?.length || 0, colors: kit.colors?.length || 0
  } }
}
export async function listMotorstackBrands(binding: MotorstackBinding) {
  const parsed = motorstackListSchema.safeParse(await boundedMotorstackCall(binding.listBrands()))
  if (!parsed.success || new Set(parsed.data.brands.map(brand => brand.id)).size !== parsed.data.brands.length) throw createError({ statusCode: 502, statusMessage: 'MotorStack returned invalid brand catalogue metadata' })
  const brands = parsed.data.brands
  const existing = brands.length ? await queryRowsFresh<{ id: string, source_url: string }>('SELECT id, source_url FROM brand_kits WHERE client_id IS NULL AND source_url = ANY($1::text[]) ORDER BY created_at, id', [brands.map(brand => motorstackSourceUrl(brand.id))]) : []
  return { brands: brands.map(brand => ({ ...brand, existingKitId: existing.find(kit => kit.source_url === motorstackSourceUrl(brand.id))?.id || null })), warnings: [] as string[] }
}
/** Fetch/validate before writes. The locked second check makes concurrent imports idempotent. */
export async function importMotorstackBrand(event: H3Event, binding: MotorstackBinding, brandId: string, userId: string): Promise<MotorstackImportResult> {
  const sourceUrl = motorstackSourceUrl(brandId)
  const existing = await queryRowsFresh<ExistingKit>(`SELECT ${EXISTING_SELECT} FROM brand_kits WHERE client_id IS NULL AND source_url = $1 ORDER BY created_at, id LIMIT 1`, [sourceUrl])
  if (existing[0]) return existingResult(brandId, existing[0])
  const prepared = await prepareMotorstackBrand(binding, brandId)
  const { metadata, warnings } = prepared
  if (!prepared.assets.length && !prepared.colors.length) return { status: 'skipped', brandId, brandName: metadata.brand.name, kitId: null, warnings: [...warnings, 'No supported brand assets were available; no kit was created.'], counts: { fonts: 0, logos: 0, colors: 0 } }
  const { nativeUpload, signingSecret } = resolveBannerAssetDelivery(event)
  const createdKeys: string[] = []
  try {
    return await transactionWithoutRetry(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`motorstack-brand:${brandId}`])
      const locked = await db.query<ExistingKit>(`SELECT ${EXISTING_SELECT} FROM brand_kits WHERE client_id IS NULL AND source_url = $1 ORDER BY created_at, id LIMIT 1 FOR SHARE`, [sourceUrl])
      if (locked.rows[0]) return existingResult(brandId, locked.rows[0])
      const managed = new Map<string, { id: string, url: string, r2Key: string }>()
      // Match generic upload's lock and sort globally to avoid cross-brand deadlocks.
      const fontLock = (asset: typeof prepared.assets[number]) => asset.font ? `banner-font:shared:${asset.font.family}:${asset.font.weight}:${asset.sha256}` : ''
      const ordered = [...prepared.assets].sort((a, b) => fontLock(a).localeCompare(fontLock(b)))
      for (const asset of ordered) {
        let reusable: { id: string, url: string, r2Key: string } | undefined
        const font = asset.font
        if (font) {
          await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [fontLock(asset)])
          const found = await db.query<{ id: string, url: string, r2Key: string }>(`SELECT id, url, r2_key AS "r2Key" FROM banner_assets WHERE client_id IS NULL AND 'font' = ANY(tags)
            AND name = $1 AND $2 = ANY(tags) AND $3 = ANY(tags) ORDER BY created_at, id LIMIT 1 FOR SHARE`, [font.family, `weight:${font.weight}`, `sha256:${asset.sha256}`])
          reusable = found.rows[0]
        }
        if (reusable) {
          managed.set(motorstackAssetKey(asset), { ...reusable, url: signingSecret ? await bannerAssetDeliveryUrl(reusable.id, getAppUrl(event), signingSecret) : reusable.url })
          continue
        }
        const id = createBannerAssetId()
        const key = createBannerAssetStorageKey(asset.fileName, userId)
        const url = signingSecret ? await bannerAssetDeliveryUrl(id, getAppUrl(event), signingSecret) : undefined
        // Record attempted writes too: a put followed by a failed head may leave an object.
        createdKeys.push(key)
        const stored = await uploadBannerAsset(asset.bytes, asset.fileName, asset.mimeType, userId, key, nativeUpload ? { bucket: nativeUpload.bucket, assetUrl: url! } : undefined, url)
        const tags = ['motorstack', `motorstack-brand:${brandId}`, `motorstack-asset:${asset.sourceId}`, `sha256:${asset.sha256}`, ...(font ? ['font', `weight:${font.weight}`, `format:${font.format}`] : ['logo'])]
        await db.query(`INSERT INTO banner_assets (id, name, mime_type, file_size, r2_key, url, tags, uploaded_by, client_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)`, [id, asset.name, asset.mimeType, stored.size, stored.key, stored.url, tags, userId])
        managed.set(motorstackAssetKey(asset), { id, url: stored.url, r2Key: stored.key })
      }
      const fonts = prepared.fonts.map((ref) => {
        const source = metadata.fonts[ref.sourceIndex]!
        return { role: source.role === 'heading' ? 'heading' : source.role === 'body' ? 'body' : 'extra', family: source.family, weights: [source.weight!], defaultWeight: source.weight!, assets: [{ id: managed.get(ref.assetKey)!.id, weight: source.weight! }] }
      })
      const logoOrder = (role: string) => role === 'main' ? 0 : role === 'on-dark' ? 1 : role === 'favicon' ? 3 : 2
      const logos = [...prepared.logos].sort((a, b) => logoOrder(metadata.logos[a.sourceIndex]!.role) - logoOrder(metadata.logos[b.sourceIndex]!.role)).map((ref) => {
        const source = metadata.logos[ref.sourceIndex]!
        const asset = managed.get(ref.assetKey)!
        return { name: `${source.variant || source.role}: ${source.name}`.slice(0, 120), url: asset.url, r2Key: asset.r2Key, variant: source.onDark === true ? 'dark' : source.onDark === false ? 'light' : 'any' }
      })
      // Usable style notes retain source roles and filenames; opaque IDs remain in asset tags.
      const guidelines = motorstackSourceNotes(prepared)
      const input = brandKitInputSchema.safeParse({ name: metadata.brand.name, clientId: null, fonts, logos, colors: prepared.colors, guidelines, sourceUrl })
      if (!input.success) throw createError({ statusCode: 422, statusMessage: 'MotorStack metadata exceeds native kit limits; no partial kit was saved' })
      await validateBrandKitFontAssets(input.data.fonts, null, db)
      const inserted = await db.query<{ id: string }>(`INSERT INTO brand_kits (name, client_id, colors, fonts, logos, guidelines, source_url, created_by)
        VALUES ($1,NULL,$2,$3,$4,$5,$6,$7) RETURNING id`, [input.data.name, JSON.stringify(input.data.colors), JSON.stringify(input.data.fonts), JSON.stringify(input.data.logos), guidelines, sourceUrl, userId])
      if (!inserted.rows[0]) throw new Error('Brand kit insert returned no row')
      return { status: 'imported', brandId, brandName: metadata.brand.name, kitId: inserted.rows[0].id, warnings, counts: { fonts: new Set(input.data.fonts.flatMap(font => font.assets!.map(asset => asset.id))).size, logos: logos.length, colors: prepared.colors.length } }
    })
  } catch (error) {
    // An uncertain COMMIT must never delete assets that a saved kit may reference.
    if (getTransactionFailureStage(error) === 'definite_rollback') await Promise.allSettled(createdKeys.map(key => deleteBannerFile(key, nativeUpload?.bucket)))
    throw error
  }
}
