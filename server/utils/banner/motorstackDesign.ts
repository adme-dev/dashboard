import type { MotorstackDesignSelection } from '~~/shared/bannerMotorstackOffer'
import { createError, type H3Event } from 'h3'
import type { ArtboardState, Layer } from '~~/app/types/banner-studio'
import { getMotorstackCreativeCatalog, type MotorstackCreativeOffer } from './motorstackCreativeCatalog'
import { queryOneFresh } from '~~/server/utils/db'
import { isCurrentMotorstackOffer } from '~~/shared/bannerMotorstackOffer'

export async function resolveMotorstackDesignOffer(event: H3Event, selection: Pick<MotorstackDesignSelection, 'kitId' | 'offerId'>, clientId: string | null) {
  const catalog = await getMotorstackCreativeCatalog(event, { kitId: selection.kitId, kind: 'offers' }, clientId)
  const offer = (catalog.items as MotorstackCreativeOffer[]).find(item => item.id === selection.offerId)
  if (!offer) throw createError({ statusCode: 409, statusMessage: 'This MotorStack offer changed or is no longer published. Reload the offers and choose again.' })
  if (!isCurrentMotorstackOffer(offer.endDate)) throw createError({ statusCode: 409, statusMessage: 'This MotorStack offer has expired. Choose a current offer.' })
  return { kit: catalog.kit, brandId: catalog.brand.id, offer }
}

export async function resolveMotorstackDesignContext(event: H3Event, selection: MotorstackDesignSelection, clientId: string | null, userId: string) {
  const context = await resolveMotorstackDesignOffer(event, selection, clientId)
  let artwork: { id: string, url: string, mimeType: string } | null = null
  if (context.offer.artworkAssetId) {
    if (!selection.assetId) throw createError({ statusCode: 422, statusMessage: 'Prepare this offer artwork before generating the set.' })
    artwork = await queryOneFresh<{ id: string, url: string, mimeType: string }>(
      `SELECT id, url, mime_type AS "mimeType" FROM banner_assets
       WHERE id = $1 AND uploaded_by = $2 AND client_id IS NULL AND tags @> $3::text[]`,
      [selection.assetId, userId, ['motorstack-media', `motorstack-brand:${context.brandId}`, `motorstack-asset:${context.offer.artworkAssetId}`]]
    )
    if (!artwork?.url || !artwork.mimeType.startsWith('image/')) throw createError({ statusCode: 403, statusMessage: 'Prepared offer artwork is outside this source or account. Prepare the offer again.' })
  } else if (selection.assetId) {
    throw createError({ statusCode: 400, statusMessage: 'This offer does not have source artwork.' })
  }
  return { ...context, artwork, checkedAt: new Date().toISOString() }
}
export type MotorstackDesignContext = Awaited<ReturnType<typeof resolveMotorstackDesignContext>>

/** Seed native layers for every requested size; the model arranges these exact source facts. */
export function motorstackOfferCanvas(original: Record<string, ArtboardState>, dimensions: Record<string, { w: number, h: number }>, context: MotorstackDesignContext) {
  const { offer, kit, artwork } = context
  const color = (role: string) => kit.colors.find((item: { role: string }) => item.role === role)?.hex
  const bgColor = color('background') || '#ffffff'
  const dark = (hex: string) => {
    const value = hex.replace('#', '')
    const full = value.length === 3 ? value.split('').map(char => char + char).join('') : value
    return 0.299 * parseInt(full.slice(0, 2), 16) + 0.587 * parseInt(full.slice(2, 4), 16) + 0.114 * parseInt(full.slice(4, 6), 16) < 140
  }
  const textColor = color('text') || (dark(bgColor) ? '#ffffff' : '#111111')
  const buttonColor = color('accent') || color('primary') || '#111111'
  const font = (role: string) => {
    const face = kit.fonts.find((item: { role: string }) => item.role === role) || kit.fonts[0]
    if (!face) return {}
    const weight = face.defaultWeight || (role === 'heading' ? Math.max(...face.weights) : face.weights[0]) || 400
    return { fontFamily: face.family, fontWeight: weight, ...(face.assets?.find((asset: { weight: number }) => asset.weight === weight) ? { fontAssetId: face.assets.find((asset: { weight: number }) => asset.weight === weight).id } : {}) }
  }
  const headline = offer.title || offer.offer || offer.model || kit.name
  const price = offer.priceLabel || (offer.price === null ? '' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(offer.price))
  const terms = [offer.disclaimer, offer.endDate ? `Offer ends ${offer.endDate}` : null].filter(Boolean).join('\n')
  const logo = kit.logos.find((item: { variant?: string }) => item.variant === (dark(bgColor) ? 'dark' : 'light')) || kit.logos.find((item: { variant?: string }) => !item.variant || item.variant === 'any') || kit.logos[0]
  return Object.fromEntries(Object.entries(original).map(([key, board]) => {
    const { w, h } = dimensions[key]!
    const wide = w / h > 1.2
    const short = Math.min(w, h)
    const duration = Math.min(300, Math.max(5, ...board.layers.map(layer => layer.endTime)))
    const locked = board.layers.filter(layer => layer.locked).map(layer => structuredClone(layer))
    let id = Math.max(0, ...board.layers.map(layer => layer.id)) + 1
    const layers = [...locked]
    const add = (role: string, values: Partial<Layer>) => layers.push({ id: id++, name: `MotorStack ${role}`, x: w * 0.06, y: h * 0.12, w: w * 0.88, h: h * 0.12,
      type: 'text', zIndex: layers.length + 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: duration,
      color: textColor, fontSize: Math.max(8, short * 0.04), ...font('body'), ...values } as Layer)
    if (artwork) add('hero', { type: 'image', src: artwork.url, fit: 'contain', x: w * (wide ? 0.48 : 0.06), y: h * 0.06, w: w * (wide ? 0.46 : 0.88), h: h * (wide ? 0.64 : 0.4) })
    if (logo?.url) add('logo', { type: 'image', src: logo.url, fit: 'contain', isLogo: true, x: w * 0.76, y: h * 0.02, w: w * 0.18, h: h * 0.1 })
    const contentW = w * (wide && artwork ? 0.4 : 0.88)
    add('headline', { text: headline, ...font('heading'), fontSize: Math.max(12, short * 0.075), y: h * (!wide && artwork ? 0.5 : 0.14), w: contentW, h: h * 0.18 })
    if (offer.offer && offer.offer !== headline) add('detail', { text: offer.offer, y: h * (!wide && artwork ? 0.69 : 0.37), w: contentW, h: h * 0.1 })
    if (price && !headline.includes(price)) add('price', { text: price, ...font('heading'), fontSize: Math.max(11, short * 0.055), y: h * (!wide && artwork ? 0.6 : 0.5), w: contentW, h: h * 0.08 })
    add('CTA', { type: 'button', text: 'Enquire now', ...font('heading'), bgColor: buttonColor, textColor: dark(buttonColor) ? '#ffffff' : '#111111', y: h * 0.78, w: w * (wide ? 0.26 : 0.5), h: h * 0.07 })
    // Keep complete source terms, even when longer than one native text field.
    for (let offset = 0; offset < terms.length; offset += 9000) add(`terms ${offset / 9000 + 1}`, { text: terms.slice(offset, offset + 9000), y: h * 0.87, h: h * 0.11, fontSize: Math.max(6, short * 0.023) })
    return [key, { ...board, bgColor, layers, motorstackSource: { kitId: kit.id, offerId: offer.id, checkedAt: context.checkedAt } }]
  }))
}

/** MotorStack AI can alter composition/animation, never source copy, terms, artwork or layer identity. */
export function protectMotorstackOfferCanvas(result: Record<string, ArtboardState>, source: Record<string, ArtboardState>) {
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(Object.keys(source).sort())) throw new Error('Offer layouts changed unexpectedly')
  for (const [key, before] of Object.entries(source)) {
    const after = result[key]!
    if (after.layers.length !== before.layers.length) throw new Error('Offer source layers must be retained')
    for (const layer of before.layers) {
      const target = after.layers.find(candidate => candidate.id === layer.id)
      if (!target || target.type !== layer.type) throw new Error('Offer source layer is missing')
      if (!layer.name.startsWith('MotorStack ')) continue
      target.hidden = false
      target.opacity = 1
      if (layer.name.startsWith('MotorStack terms')) {
        target.startTime = layer.startTime
        target.endTime = layer.endTime
        target.animIn = 'none'
        target.animOut = 'none'
        target.animInDur = 0
        target.outDur = 0
        target.keyframes = undefined
      }
      for (const property of ['name', 'text', 'src', 'isLogo', 'fontFamily', 'fontWeight', 'fontAssetId'] as const) {
        if (layer[property] === undefined) Reflect.deleteProperty(target, property)
        else Object.assign(target, { [property]: layer[property] })
      }
    }
  }
  return result
}

/** A follow-up keeps the current composition, but rechecks every source role against the live offer. */
export function refineMotorstackOfferCanvas(canvas: Record<string, ArtboardState>, dimensions: Record<string, { w: number, h: number }>, context: MotorstackDesignContext) {
  const blank = Object.fromEntries(Object.keys(canvas).map(key => [key, { layers: [] }]))
  const canonical = motorstackOfferCanvas(blank, dimensions, context)
  for (const [key, board] of Object.entries(canvas)) {
    board.motorstackSource = { kitId: context.kit.id, offerId: context.offer.id, checkedAt: context.checkedAt }
    for (const expected of canonical[key]!.layers) {
      const matches = board.layers.filter(layer => layer.name === expected.name)
      if (matches.length !== 1 || matches[0]!.type !== expected.type || matches[0]!.text !== expected.text || matches[0]!.src !== expected.src) {
        throw createError({ statusCode: 409, statusMessage: 'The offer or its source layers changed. Create a fresh MotorStack set before refining.' })
      }
    }
  }
  return canvas
}
