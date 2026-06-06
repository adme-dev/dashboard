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
const DEFAULT_FOOTER_LEGAL_TEXT = 'The Agency · 100 George St, Sydney NSW 2000, Australia. You are receiving this email because you subscribed to updates.'

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
    additionalText = DEFAULT_FOOTER_LEGAL_TEXT,
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

/**
 * Email-safe "heading + See all ›" row that MIMICS Postcards content headers:
 * a bold heading on the left, an optional small pill link on the right.
 * Returns a `<tr>` to be embedded inside an outer presentation table.
 */
function headingRowWithSeeAll(
  heading: string,
  seeAll: boolean,
  colspan: number,
  seeAllUrl = '#'
): string {
  if (!heading && !seeAll) return ''
  const pill = seeAll
    ? `<a href="${escapeAttr(seeAllUrl)}" style="display:inline-block;padding:5px 12px;background:#f3f4f6;border-radius:999px;font-size:12px;font-weight:700;color:#374151;text-decoration:none;white-space:nowrap;">See all &rsaquo;</a>`
    : ''
  return `<tr><td colspan="${Math.max(1, colspan)}" style="padding:0 8px 14px 8px;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="font-size:20px;font-weight:700;line-height:1.3;color:#111827;">${escapeHtml(heading)}</td>
        <td valign="middle" align="right" style="white-space:nowrap;">${pill}</td>
      </tr>
    </table>
  </td></tr>`
}

export interface BlogCard {
  date?: string
  title?: string
  url?: string
  imageUrl?: string
  imageSeed?: string
}

export interface BlogCardRowOpts {
  heading?: string
  cards?: BlogCard[]
  backgroundColor?: string
  accentColor?: string
  padding?: Padding
}

/**
 * Html: row of blog cards that MIMICS Postcards "CONTENT 1" — optional centered
 * heading above a row of photo cards, each card overlaying the date (small
 * uppercase accent label) + bold WHITE title ON the image via an email-safe
 * `background-image` cell with a dark bottom gradient. The `<img>` stays as a
 * graceful fallback for clients that strip background images.
 */
export function blogCardRow(opts: BlogCardRowOpts = {}): EdmPresetBlockTemplate {
  const {
    heading = '',
    cards = [
      { date: 'Latest', title: 'Your first post title' },
      { date: 'Latest', title: 'Your second post title' }
    ],
    backgroundColor = '#ffffff',
    accentColor = '#7dd3fc',
    padding = PAD_SECTION
  } = opts

  const cellWidth = cards.length > 0 ? Math.floor(100 / cards.length) : 100
  const cells = cards
    .map((card, i) => {
      const seed = card.imageSeed || `blog-${i}`
      const img = card.imageUrl || picsum(seed, 280, 180)
      const href = escapeAttr(card.url || '#')
      const safeImg = escapeAttr(img)
      return `<td valign="top" width="${cellWidth}%" style="padding:8px;font-family:Arial,sans-serif;">
        <a href="${href}" style="text-decoration:none;color:inherit;display:block;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:8px;overflow:hidden;background-color:#1f2937;background-image:url('${safeImg}');background-size:cover;background-position:center;height:180px;">
            <tr>
              <td valign="bottom" height="180" style="height:180px;background-image:url('${safeImg}');background-size:cover;background-position:center;">
                <div style="padding:14px 14px 12px 14px;background:linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0.15) 70%, rgba(0,0,0,0));">
                  <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${escapeAttr(accentColor)};">${escapeHtml(card.date || '')}</div>
                  <div style="margin-top:4px;font-size:16px;font-weight:700;line-height:1.3;color:#ffffff;">${escapeHtml(card.title || '')}</div>
                </div>
              </td>
            </tr>
          </table>
          <img loading="lazy" src="${safeImg}" alt="${escapeAttr(card.title || 'Blog image')}" width="1" height="1" style="display:none;width:1px;height:1px;max-height:0;overflow:hidden;opacity:0;" />
        </a>
      </td>`
    })
    .join('')

  const headingHtml = heading
    ? `<tr><td colspan="${Math.max(1, cards.length)}" align="center" style="padding:0 8px 16px 8px;font-family:Arial,sans-serif;">
        <div style="font-size:18px;font-weight:700;line-height:1.3;color:#111827;">${escapeHtml(heading)}</div>
      </td></tr>`
    : ''

  const contents = `${TABLE_OPEN} style="border-collapse:collapse;">${headingHtml}<tr>${cells}</tr></table>`
  return htmlBlock(contents, padding, backgroundColor)
}

export interface BrandLogo {
  name?: string
}

export interface ClientLogoStripOpts {
  heading?: string
  subtitle?: string
  brands?: BrandLogo[]
  columns?: number
  backgroundColor?: string
  padding?: Padding
}

/**
 * Html: client-logo grid that MIMICS Postcards "CONTENT 3/4" — optional centered
 * heading + subtitle above a grid of GRAYSCALE brand WORDMARKS rendered as
 * styled text (bold, gray). No photos / Picsum — logos are text, not imagery.
 * Defaults are generic placeholder names (no real trademarks).
 */
export function clientLogoStrip(opts: ClientLogoStripOpts = {}): EdmPresetBlockTemplate {
  const {
    heading = '',
    subtitle = '',
    brands = [
      { name: 'Northwind' },
      { name: 'Globex' },
      { name: 'Acme' },
      { name: 'Umbrella' },
      { name: 'Initech' },
      { name: 'Soylent' }
    ],
    columns = 3,
    backgroundColor = '#ffffff',
    padding = { top: 24, right: 32, bottom: 24, left: 32 }
  } = opts

  const cellWidth = Math.floor(100 / Math.max(1, columns))
  const cellFor = (brand: BrandLogo): string => {
    return `<td valign="middle" align="center" width="${cellWidth}%" style="padding:14px 8px;font-family:Arial,sans-serif;">
      <div style="color:#9ca3af;font-weight:700;font-size:16px;letter-spacing:0.01em;">${escapeHtml(brand.name || '')}</div>
    </td>`
  }

  const rows: string[] = []
  for (let i = 0; i < brands.length; i += columns) {
    const rowBrands = brands.slice(i, i + columns)
    const cells = rowBrands.map(b => cellFor(b)).join('')
    rows.push(`<tr>${cells}</tr>`)
  }

  const headingRows: string[] = []
  if (heading) {
    headingRows.push(`<tr><td colspan="${Math.max(1, columns)}" align="center" style="padding:0 8px 4px 8px;font-family:Arial,sans-serif;">
      <div style="font-size:18px;font-weight:700;line-height:1.3;color:#111827;">${escapeHtml(heading)}</div>
    </td></tr>`)
  }
  if (subtitle) {
    headingRows.push(`<tr><td colspan="${Math.max(1, columns)}" align="center" style="padding:0 8px 12px 8px;font-family:Arial,sans-serif;">
      <div style="font-size:13px;line-height:1.5;color:#6b7280;">${escapeHtml(subtitle)}</div>
    </td></tr>`)
  }

  const contents = `${TABLE_OPEN} style="border-collapse:collapse;">${headingRows.join('')}${rows.join('')}</table>`
  return htmlBlock(contents, padding, backgroundColor)
}

export interface ServiceItem {
  name?: string
  text?: string
  iconColor?: string
  iconLabel?: string
}

export interface ServicesGridOpts {
  heading?: string
  seeAll?: boolean
  seeAllUrl?: string
  description?: string
  columns?: number
  items?: ServiceItem[]
  backgroundColor?: string
  padding?: Padding
}

const SERVICE_ICON_COLORS = ['#0ea5e9', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#14b8a6']

/**
 * Html: services / features grid that MIMICS Postcards "CONTENT 2" — a bold
 * heading with an optional "See all ›" pill on the same row, an optional
 * one-line description, then a 2-column grid of items. Each item = a small
 * colored rounded-square CSS ICON (no photos) + bold name + muted supporting
 * line. Icons are styled `<td>` cells with a background color, NOT Picsum.
 */
export function servicesGrid(opts: ServicesGridOpts = {}): EdmPresetBlockTemplate {
  const {
    heading = '',
    seeAll = false,
    seeAllUrl = '#',
    description = '',
    columns = 2,
    items = [
      { name: 'Strategy', text: 'A plan tied to your goals.' },
      { name: 'Creative', text: 'On-brand designs and copy.' },
      { name: 'Delivery', text: 'Assets shipped every sprint.' },
      { name: 'Reporting', text: 'Clear results after each send.' }
    ],
    backgroundColor = '#ffffff',
    padding = PAD_SECTION
  } = opts

  const safeColumns = Math.max(1, columns)
  const cellWidth = Math.floor(100 / safeColumns)

  const cellFor = (item: ServiceItem, i: number): string => {
    const iconColor = item.iconColor || SERVICE_ICON_COLORS[i % SERVICE_ICON_COLORS.length]
    const iconLabel = escapeHtml(item.iconLabel || (item.name ? item.name.charAt(0).toUpperCase() : '•'))
    return `<td valign="top" width="${cellWidth}%" style="padding:10px 8px;font-family:Arial,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td valign="top" width="40" style="width:40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td align="center" valign="middle" width="40" height="40" style="width:40px;height:40px;background-color:${escapeAttr(iconColor)};border-radius:10px;color:#ffffff;font-size:16px;font-weight:700;line-height:40px;text-align:center;">${iconLabel}</td>
              </tr>
            </table>
          </td>
          <td valign="top" style="padding-left:12px;">
            <div style="font-size:15px;font-weight:700;line-height:1.3;color:#111827;">${escapeHtml(item.name || '')}</div>
            <div style="margin-top:3px;font-size:13px;line-height:1.5;color:#6b7280;">${escapeHtml(item.text || '')}</div>
          </td>
        </tr>
      </table>
    </td>`
  }

  const rows: string[] = []
  for (let i = 0; i < items.length; i += safeColumns) {
    const rowItems = items.slice(i, i + safeColumns)
    const cells = rowItems.map((it, j) => cellFor(it, i + j)).join('')
    rows.push(`<tr>${cells}</tr>`)
  }

  const headerRow = headingRowWithSeeAll(heading, seeAll, safeColumns, seeAllUrl)
  const descRow = description
    ? `<tr><td colspan="${safeColumns}" style="padding:0 8px 14px 8px;font-family:Arial,sans-serif;">
        <div style="font-size:14px;line-height:1.6;color:#4b5563;">${escapeHtml(description)}</div>
      </td></tr>`
    : ''

  const contents = `${TABLE_OPEN} style="border-collapse:collapse;">${headerRow}${descRow}${rows.join('')}</table>`
  return htmlBlock(contents, padding, backgroundColor)
}

export interface StoryItem {
  heading?: string
  blurb?: string
  date?: string
  url?: string
  imageUrl?: string
  imageSeed?: string
}

export interface StoryGridOpts {
  heading?: string
  seeAll?: boolean
  seeAllUrl?: string
  stories?: StoryItem[]
  columns?: number
  accentColor?: string
  backgroundColor?: string
  padding?: Padding
}

/**
 * Html: image-card story grid that MIMICS Postcards "CONTENT 5" — optional
 * heading + "See all ›" pill row, then photo cards with an optional date label,
 * a bold heading, and a short blurb beneath each image.
 */
export function storyGrid(opts: StoryGridOpts = {}): EdmPresetBlockTemplate {
  const {
    heading = '',
    seeAll = false,
    seeAllUrl = '#',
    stories = [
      { heading: 'Story one', blurb: 'A short supporting line.' },
      { heading: 'Story two', blurb: 'A short supporting line.' }
    ],
    columns = 2,
    accentColor = '#0ea5e9',
    backgroundColor = '#ffffff',
    padding = PAD_SECTION
  } = opts

  const cellWidth = Math.floor(100 / Math.max(1, columns))
  const cellFor = (story: StoryItem, i: number): string => {
    const seed = story.imageSeed || `story-${i}`
    const img = story.imageUrl || picsum(seed, 280, 180)
    const href = escapeAttr(story.url || '#')
    const dateHtml = story.date
      ? `<div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${escapeAttr(accentColor)};">${escapeHtml(story.date)}</div>`
      : ''
    const headingMargin = story.date ? '4px' : '10px'
    return `<td valign="top" width="${cellWidth}%" style="padding:8px;font-family:Arial,sans-serif;">
      <a href="${href}" style="text-decoration:none;color:inherit;">
        <img loading="lazy" src="${escapeAttr(img)}" alt="${escapeAttr(story.heading || 'Story image')}" width="100%" height="150" style="display:block;width:100%;height:150px;object-fit:cover;border-radius:8px;" />
        ${dateHtml}
        <div style="margin-top:${headingMargin};font-size:17px;font-weight:700;line-height:1.3;color:#111827;">${escapeHtml(story.heading || '')}</div>
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

  const headerRow = headingRowWithSeeAll(heading, seeAll, columns, seeAllUrl)
  const contents = `${TABLE_OPEN} style="border-collapse:collapse;">${headerRow}${rows.join('')}</table>`
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
