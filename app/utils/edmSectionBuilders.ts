// app/utils/edmSectionBuilders.ts
// Reusable helpers for authoring rich, image-driven EDM section presets.
//
// Two flavours of builder:
//  1. Native-block builders (heroImage, ctaBanner, featureRow, brandHeader,
//     navMenu, richFooter) → return an EdmPresetBlockTemplate whose `type` is a
//     first-class block the editor renderer AND the server renderer both
//     understand (hero-section, cta-banner, feature-grid, header, menu, footer).
//  2. Html rich-layout builders (blogCardRow, clientLogoStrip, storyGrid,
//     productCard, productRow, imageTextRow) → return an `Html` block whose
//     `props.contents` is EMAIL-SAFE markup (presentation tables + inline styles,
//     no flexbox/grid). The Html block renders identically in the editor preview,
//     the live thumbnail, and the server export, so multi-column / image-grid
//     layouts stay WYSIWYG everywhere.
//
// Imagery comes from Lorem Picsum (royalty-free, no key):
//   https://picsum.photos/seed/<seed>/<w>/<h>
//
// CONSTRAINT: only emit block types in the EDITOR ∩ SERVER intersection. Do NOT
// use Container/ColumnsContainer for rich nested content — the thumbnail does not
// recurse their children, so nested content would be invisible in thumbnails.

import type { EdmPresetBlockTemplate } from '~~/app/utils/edmPresets'

// ---------------------------------------------------------------------------
// Imagery + escaping
// ---------------------------------------------------------------------------

/** Build a seeded Lorem Picsum URL. Royalty-free, no API key required. */
export function picsum(seed: string, w: number, h: number): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`
}

/**
 * Escape caller-supplied text before interpolating into Html block markup.
 * app/utils is client-side, so we inline a tiny escaper rather than import a
 * server helper. Escapes the five HTML-significant characters.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape a value for use inside an href/src attribute (defends against `"` breakouts). */
function escapeAttr(value: unknown): string {
  return escapeHtml(value)
}

// ---------------------------------------------------------------------------
// Shared opt types
// ---------------------------------------------------------------------------

export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

const PAD_SECTION: Padding = { top: 28, right: 24, bottom: 28, left: 24 }

function block(type: string, data: EdmPresetBlockTemplate['data']): EdmPresetBlockTemplate {
  return { type, data }
}

// ---------------------------------------------------------------------------
// Native-block builders
// ---------------------------------------------------------------------------

export interface HeroImageOpts {
  heading?: string
  subheading?: string
  ctaText?: string
  ctaUrl?: string
  imageUrl?: string
  imageSeed?: string
  overlayOpacity?: number
  textColor?: string
  padding?: Padding
}

/** hero-section — full-bleed image with overlaid heading/subheading/CTA. */
export function heroImage(opts: HeroImageOpts = {}): EdmPresetBlockTemplate {
  const {
    heading = 'Your headline here',
    subheading = '',
    ctaText = '',
    ctaUrl = '#',
    imageSeed = 'edm-hero',
    imageUrl = picsum(imageSeed, 600, 320),
    overlayOpacity = 0.4,
    textColor = '#ffffff',
    padding = { top: 56, right: 32, bottom: 56, left: 32 }
  } = opts
  return block('hero-section', {
    style: { padding, fontFamily: 'MODERN_SANS' },
    props: { imageUrl, heading, subheading, ctaText, ctaUrl, overlayOpacity, textColor }
  })
}

export interface CtaBannerOpts {
  heading?: string
  subheading?: string
  ctaText?: string
  ctaUrl?: string
  backgroundColor?: string
  textColor?: string
  padding?: Padding
}

/** cta-banner — solid-colour call to action. */
export function ctaBanner(opts: CtaBannerOpts = {}): EdmPresetBlockTemplate {
  const {
    heading = 'Ready to get started?',
    subheading = '',
    ctaText = 'Get started',
    ctaUrl = '#',
    backgroundColor = '#0f62fe',
    textColor = '#ffffff',
    padding = { top: 32, right: 32, bottom: 32, left: 32 }
  } = opts
  return block('cta-banner', {
    style: { padding, fontFamily: 'MODERN_SANS' },
    props: { heading, subheading, ctaText, ctaUrl, backgroundColor, textColor }
  })
}

export interface FeatureItem {
  icon?: string
  heading?: string
  description?: string
}

export interface FeatureRowOpts {
  features?: FeatureItem[]
  columns?: number
  iconColor?: string
  backgroundColor?: string
  padding?: Padding
}

/** feature-grid — icon + heading + description cards in a responsive row. */
export function featureRow(opts: FeatureRowOpts = {}): EdmPresetBlockTemplate {
  const {
    features = [
      { icon: '•', heading: 'Plan', description: 'Map the launch.' },
      { icon: '•', heading: 'Build', description: 'Create the assets.' },
      { icon: '•', heading: 'Send', description: 'Reach the audience.' }
    ],
    columns = 3,
    iconColor = '#0ea5e9',
    backgroundColor = '#ffffff',
    padding = PAD_SECTION
  } = opts
  return block('feature-grid', {
    style: { padding, backgroundColor },
    props: { columns, iconColor, features }
  })
}

export interface BrandHeaderOpts {
  tagline?: string
  logoUrl?: string
  alignment?: 'left' | 'center' | 'right'
  backgroundColor?: string
  color?: string
  padding?: Padding
}

/** header — brand wordmark / logo line. */
export function brandHeader(opts: BrandHeaderOpts = {}): EdmPresetBlockTemplate {
  const {
    tagline = 'Your brand',
    logoUrl = '',
    alignment = 'center',
    backgroundColor = '#ffffff',
    color = '#111827',
    padding = { top: 24, right: 24, bottom: 16, left: 24 }
  } = opts
  return block('header', {
    style: { padding, textAlign: alignment, backgroundColor, color },
    props: { logoUrl, tagline, alignment, backgroundColor }
  })
}

export interface MenuLink {
  label: string
  url?: string
}

export interface NavMenuOpts {
  items?: MenuLink[]
  separator?: string
  color?: string
  backgroundColor?: string
  padding?: Padding
}

/** menu — horizontal navigation / social link row. */
export function navMenu(opts: NavMenuOpts = {}): EdmPresetBlockTemplate {
  const {
    items = [
      { label: 'Work', url: '#' },
      { label: 'Offers', url: '#' },
      { label: 'Contact', url: '#' }
    ],
    separator = '•',
    color = '#111827',
    backgroundColor = '#ffffff',
    padding = { top: 12, right: 24, bottom: 18, left: 24 }
  } = opts
  return block('menu', {
    style: { padding, color, backgroundColor },
    props: { separator, items }
  })
}

export interface RichFooterOpts {
  additionalText?: string
  showUnsubscribe?: boolean
  showAddress?: boolean
  backgroundColor?: string
  color?: string
  padding?: Padding
}

/** footer — legal / unsubscribe footer. */
export function richFooter(opts: RichFooterOpts = {}): EdmPresetBlockTemplate {
  const {
    additionalText = 'You are receiving this email because you subscribed to updates.',
    showUnsubscribe = true,
    showAddress = false,
    backgroundColor = '#f5f5f5',
    color = '#6b7280',
    padding = { top: 24, right: 32, bottom: 24, left: 32 }
  } = opts
  return block('footer', {
    style: { padding, backgroundColor, color },
    props: { additionalText, showUnsubscribe, showAddress, backgroundColor }
  })
}

// ---------------------------------------------------------------------------
// Html rich-layout builders — email-safe presentation tables, inline styles
// ---------------------------------------------------------------------------

const TABLE_OPEN = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'

function htmlBlock(contents: string, padding: Padding, backgroundColor: string): EdmPresetBlockTemplate {
  return block('Html', {
    style: { padding, backgroundColor },
    props: { contents }
  })
}

export interface BlogCard {
  date?: string
  title?: string
  url?: string
  imageUrl?: string
  imageSeed?: string
}

export interface BlogCardRowOpts {
  cards?: BlogCard[]
  backgroundColor?: string
  accentColor?: string
  padding?: Padding
}

/** Html: 2-up image cards with date + title. */
export function blogCardRow(opts: BlogCardRowOpts = {}): EdmPresetBlockTemplate {
  const {
    cards = [
      { date: 'Latest', title: 'Your first post title' },
      { date: 'Latest', title: 'Your second post title' }
    ],
    backgroundColor = '#ffffff',
    accentColor = '#0ea5e9',
    padding = PAD_SECTION
  } = opts

  const cellWidth = cards.length > 0 ? Math.floor(100 / cards.length) : 100
  const cells = cards
    .map((card, i) => {
      const seed = card.imageSeed || `blog-${i}`
      const img = card.imageUrl || picsum(seed, 280, 180)
      const href = escapeAttr(card.url || '#')
      return `<td valign="top" width="${cellWidth}%" style="padding:8px;font-family:Arial,sans-serif;">
        <a href="${href}" style="text-decoration:none;color:inherit;">
          <img loading="lazy" src="${escapeAttr(img)}" alt="${escapeAttr(card.title || 'Blog image')}" width="100%" height="160" style="display:block;width:100%;height:160px;object-fit:cover;border-radius:8px;" />
          <div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${escapeAttr(accentColor)};">${escapeHtml(card.date || '')}</div>
          <div style="margin-top:4px;font-size:16px;font-weight:700;line-height:1.3;color:#111827;">${escapeHtml(card.title || '')}</div>
        </a>
      </td>`
    })
    .join('')

  const contents = `${TABLE_OPEN} style="border-collapse:collapse;"><tr>${cells}</tr></table>`
  return htmlBlock(contents, padding, backgroundColor)
}

export interface BrandLogo {
  name?: string
  imageUrl?: string
  imageSeed?: string
}

export interface ClientLogoStripOpts {
  brands?: BrandLogo[]
  columns?: number
  backgroundColor?: string
  padding?: Padding
}

/** Html: logo / brand-name grid. */
export function clientLogoStrip(opts: ClientLogoStripOpts = {}): EdmPresetBlockTemplate {
  const {
    brands = [{ name: 'Brand One' }, { name: 'Brand Two' }, { name: 'Brand Three' }],
    columns = 3,
    backgroundColor = '#ffffff',
    padding = { top: 24, right: 32, bottom: 24, left: 32 }
  } = opts

  const cellWidth = Math.floor(100 / Math.max(1, columns))
  const cellFor = (brand: BrandLogo, i: number): string => {
    const seed = brand.imageSeed || `logo-${i}`
    const img = brand.imageUrl || picsum(seed, 120, 60)
    return `<td valign="middle" align="center" width="${cellWidth}%" style="padding:12px 8px;font-family:Arial,sans-serif;">
      <img loading="lazy" src="${escapeAttr(img)}" alt="${escapeAttr(brand.name || 'Brand logo')}" width="96" height="48" style="display:inline-block;width:96px;height:48px;object-fit:contain;opacity:0.85;" />
      <div style="margin-top:6px;font-size:12px;font-weight:700;color:#9ca3af;">${escapeHtml(brand.name || '')}</div>
    </td>`
  }

  const rows: string[] = []
  for (let i = 0; i < brands.length; i += columns) {
    const rowBrands = brands.slice(i, i + columns)
    const cells = rowBrands.map((b, j) => cellFor(b, i + j)).join('')
    rows.push(`<tr>${cells}</tr>`)
  }

  const contents = `${TABLE_OPEN} style="border-collapse:collapse;">${rows.join('')}</table>`
  return htmlBlock(contents, padding, backgroundColor)
}

export interface StoryItem {
  heading?: string
  blurb?: string
  url?: string
  imageUrl?: string
  imageSeed?: string
}

export interface StoryGridOpts {
  stories?: StoryItem[]
  columns?: number
  backgroundColor?: string
  padding?: Padding
}

/** Html: image + heading + blurb cards. */
export function storyGrid(opts: StoryGridOpts = {}): EdmPresetBlockTemplate {
  const {
    stories = [
      { heading: 'Story one', blurb: 'A short supporting line.' },
      { heading: 'Story two', blurb: 'A short supporting line.' }
    ],
    columns = 2,
    backgroundColor = '#ffffff',
    padding = PAD_SECTION
  } = opts

  const cellWidth = Math.floor(100 / Math.max(1, columns))
  const cellFor = (story: StoryItem, i: number): string => {
    const seed = story.imageSeed || `story-${i}`
    const img = story.imageUrl || picsum(seed, 280, 180)
    const href = escapeAttr(story.url || '#')
    return `<td valign="top" width="${cellWidth}%" style="padding:8px;font-family:Arial,sans-serif;">
      <a href="${href}" style="text-decoration:none;color:inherit;">
        <img loading="lazy" src="${escapeAttr(img)}" alt="${escapeAttr(story.heading || 'Story image')}" width="100%" height="150" style="display:block;width:100%;height:150px;object-fit:cover;border-radius:8px;" />
        <div style="margin-top:10px;font-size:17px;font-weight:700;line-height:1.3;color:#111827;">${escapeHtml(story.heading || '')}</div>
        <div style="margin-top:4px;font-size:13px;line-height:1.5;color:#4b5563;">${escapeHtml(story.blurb || '')}</div>
      </a>
    </td>`
  }

  const rows: string[] = []
  for (let i = 0; i < stories.length; i += columns) {
    const rowStories = stories.slice(i, i + columns)
    const cells = rowStories.map((s, j) => cellFor(s, i + j)).join('')
    rows.push(`<tr>${cells}</tr>`)
  }

  const contents = `${TABLE_OPEN} style="border-collapse:collapse;">${rows.join('')}</table>`
  return htmlBlock(contents, padding, backgroundColor)
}

export interface ProductCardOpts {
  name?: string
  price?: string
  ctaText?: string
  ctaUrl?: string
  imageUrl?: string
  imageSeed?: string
  buttonColor?: string
  backgroundColor?: string
  padding?: Padding
}

/** Html: single product — image + name + price + buy button. */
export function productCard(opts: ProductCardOpts = {}): EdmPresetBlockTemplate {
  const {
    name = 'Product name',
    price = '$0',
    ctaText = 'Add to cart',
    ctaUrl = '#',
    imageSeed = 'product',
    imageUrl = picsum(imageSeed, 320, 220),
    buttonColor = '#0f766e',
    backgroundColor = '#ffffff',
    padding = PAD_SECTION
  } = opts

  const contents = `${TABLE_OPEN} style="border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:8px;font-family:Arial,sans-serif;">
        <img loading="lazy" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(name)}" width="100%" height="200" style="display:block;width:100%;height:200px;object-fit:cover;border-radius:8px;" />
        <div style="margin-top:12px;font-size:18px;font-weight:700;color:#111827;">${escapeHtml(name)}</div>
        <div style="margin-top:4px;font-size:16px;font-weight:700;color:${escapeAttr(buttonColor)};">${escapeHtml(price)}</div>
        <a href="${escapeAttr(ctaUrl)}" style="display:inline-block;margin-top:14px;padding:10px 24px;background:${escapeAttr(buttonColor)};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">${escapeHtml(ctaText)}</a>
      </td>
    </tr>
  </table>`
  return htmlBlock(contents, padding, backgroundColor)
}

export interface Product {
  name?: string
  price?: string
  ctaText?: string
  ctaUrl?: string
  imageUrl?: string
  imageSeed?: string
}

export interface ProductRowOpts {
  products?: Product[]
  columns?: number
  buttonColor?: string
  backgroundColor?: string
  padding?: Padding
}

/** Html: row of products — image + name + price + button each. */
export function productRow(opts: ProductRowOpts = {}): EdmPresetBlockTemplate {
  const {
    products = [
      { name: 'Product A', price: '$0' },
      { name: 'Product B', price: '$0' }
    ],
    columns = products.length || 2,
    buttonColor = '#0f766e',
    backgroundColor = '#ffffff',
    padding = PAD_SECTION
  } = opts

  const cellWidth = Math.floor(100 / Math.max(1, columns))
  const cellFor = (product: Product, i: number): string => {
    const seed = product.imageSeed || `product-${i}`
    const img = product.imageUrl || picsum(seed, 260, 180)
    return `<td valign="top" align="center" width="${cellWidth}%" style="padding:8px;font-family:Arial,sans-serif;">
      <img loading="lazy" src="${escapeAttr(img)}" alt="${escapeAttr(product.name || 'Product')}" width="100%" height="150" style="display:block;width:100%;height:150px;object-fit:cover;border-radius:8px;" />
      <div style="margin-top:10px;font-size:15px;font-weight:700;color:#111827;">${escapeHtml(product.name || '')}</div>
      <div style="margin-top:2px;font-size:14px;font-weight:700;color:${escapeAttr(buttonColor)};">${escapeHtml(product.price || '')}</div>
      <a href="${escapeAttr(product.ctaUrl || '#')}" style="display:inline-block;margin-top:10px;padding:8px 18px;background:${escapeAttr(buttonColor)};color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;">${escapeHtml(product.ctaText || 'Shop now')}</a>
    </td>`
  }

  const rows: string[] = []
  for (let i = 0; i < products.length; i += columns) {
    const rowProducts = products.slice(i, i + columns)
    const cells = rowProducts.map((p, j) => cellFor(p, i + j)).join('')
    rows.push(`<tr>${cells}</tr>`)
  }

  const contents = `${TABLE_OPEN} style="border-collapse:collapse;">${rows.join('')}</table>`
  return htmlBlock(contents, padding, backgroundColor)
}

export interface ImageTextRowOpts {
  heading?: string
  text?: string
  ctaText?: string
  ctaUrl?: string
  imageUrl?: string
  imageSeed?: string
  imageSide?: 'left' | 'right'
  buttonColor?: string
  backgroundColor?: string
  padding?: Padding
}

/** Html: image beside heading + text + button (two-column). */
export function imageTextRow(opts: ImageTextRowOpts = {}): EdmPresetBlockTemplate {
  const {
    heading = 'Section heading',
    text = 'Supporting copy goes here to explain the value.',
    ctaText = '',
    ctaUrl = '#',
    imageSeed = 'feature',
    imageUrl = picsum(imageSeed, 280, 220),
    imageSide = 'left',
    buttonColor = '#0ea5e9',
    backgroundColor = '#ffffff',
    padding = PAD_SECTION
  } = opts

  const imageCell = `<td valign="middle" width="44%" style="padding:8px;font-family:Arial,sans-serif;">
    <img loading="lazy" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(heading)}" width="100%" height="180" style="display:block;width:100%;height:180px;object-fit:cover;border-radius:8px;" />
  </td>`

  const ctaHtml = ctaText
    ? `<a href="${escapeAttr(ctaUrl)}" style="display:inline-block;margin-top:14px;padding:9px 20px;background:${escapeAttr(buttonColor)};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">${escapeHtml(ctaText)}</a>`
    : ''

  const textCell = `<td valign="middle" width="56%" style="padding:8px 16px;font-family:Arial,sans-serif;">
    <div style="font-size:20px;font-weight:700;line-height:1.3;color:#111827;">${escapeHtml(heading)}</div>
    <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#4b5563;">${escapeHtml(text)}</div>
    ${ctaHtml}
  </td>`

  const row = imageSide === 'right' ? `${textCell}${imageCell}` : `${imageCell}${textCell}`
  const contents = `${TABLE_OPEN} style="border-collapse:collapse;"><tr>${row}</tr></table>`
  return htmlBlock(contents, padding, backgroundColor)
}
