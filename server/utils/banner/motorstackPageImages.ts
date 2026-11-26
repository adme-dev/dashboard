import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { boundedMotorstackCall, motorstackListSchema } from './motorstackClient'

const origin = 'https://motorstackmedia.driveagent.io'
const fileTypes: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png', gif: 'image/gif' }
type Image = { filename?: string, alt?: string }
type Page = {
  page_slug: string, model_name?: string, heading?: string, has_content?: boolean, retired?: boolean,
  desktop_filename?: string, tablet_filename?: string, mobile_filename?: string, hero_image?: Image, gallery?: Image[]
}
type Collection = 'lifestyle' | 'headers'

async function catalogueJson<T>(path: string, missing: T): Promise<T> {
  const response = await fetch(origin + '/' + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
  if (response.status === 404) return missing
  if (!response.ok) throw createError({ statusCode: 502, statusMessage: 'MotorStack image catalogue is unavailable' })
  return response.json() as Promise<T>
}

export async function pageImageCatalog(binding: { listBrands?: () => Promise<unknown> }, brandId: string, collection: Collection, model?: string) {
  const access = motorstackListSchema.safeParse(await boundedMotorstackCall(binding.listBrands?.() ?? Promise.resolve(null)))
  if (!access.success) throw createError({ statusCode: 502, statusMessage: 'MotorStack brand list is unavailable' })
  const brand = access.data.brands.find(item => item.id === brandId)
  if (!brand) throw createError({ statusCode: 403, statusMessage: 'MotorStack brand unavailable' })
  const [pack, visibility] = await Promise.all([
    catalogueJson<{ pages: Page[] }>(brandId + '/pagepacks/pagepacks.json', { pages: [] }),
    catalogueJson<{ hidden: string[] }>('config/vehicle-pages-hidden.json', { hidden: [] })
  ])
  const hidden = new Set(visibility.hidden)
  const models = new Set<string>()
  const seen = new Set<string>()
  const assets = []
  let truncated = false
  for (const page of pack.pages) {
    if (!page.has_content || page.retired || hidden.has(brandId + '/' + page.page_slug)) continue
    const name = page.model_name || page.heading || page.page_slug
    models.add(name)
    if (model && model !== name) continue
    const headers = [
      { filename: page.desktop_filename || page.hero_image?.filename, alt: 'Desktop header' },
      { filename: page.tablet_filename, alt: 'Tablet header' }, { filename: page.mobile_filename, alt: 'Mobile header' }
    ]
    const headerFiles = new Set(headers.map(item => item.filename))
    for (const image of collection === 'headers' ? headers : page.gallery || []) {
      const filename = image?.filename
      if (!filename || !/^[\w. -]+$/.test(filename) || seen.has(filename) || (collection === 'lifestyle' && headerFiles.has(filename))) continue
      const mime = fileTypes[filename.split('.').pop()!.toLowerCase()]
      if (!mime) continue
      seen.add(filename)
      if (assets.length >= 500) { truncated = true; continue }
      // Only the provider's mirrored files are selectable. Source-page URLs are never fetched.
      const previewUrl = origin + '/' + brandId + '/pagepacks/images/' + encodeURIComponent(filename)
      const id = createHash('sha256').update(brandId + '\n' + previewUrl).digest('hex')
      assets.push({ id, name: (name + ' · ' + (image.alt || filename)).slice(0, 255), type: collection, mime, importable: true, previewUrl })
    }
  }
  return { schemaVersion: 1, brand, assets, models: [...models].sort(), warnings: truncated ? ['Choose a model to see its full image collection.'] : [] }
}
