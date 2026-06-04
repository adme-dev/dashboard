/**
 * Shared EDM Block Types
 *
 * Consolidated type definitions extracted from the three email renderers
 * (mjml-renderer.ts, flyhub-html-renderer.ts, maizzle-renderer.ts).
 * This is the single source of truth — renderers should import from here.
 */

// ---------------------------------------------------------------------------
// Font family mapping — exact match to @flyhub/email-core FONT_FAMILIES
// ---------------------------------------------------------------------------

export const FONT_FAMILY_MAP: Record<string, string> = {
  MODERN_SANS: '"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif',
  BOOK_SANS: 'Optima, Candara, "Noto Sans", source-sans-pro, sans-serif',
  ORGANIC_SANS:
    'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
  GEOMETRIC_SANS:
    'Avenir, "Avenir Next LT Pro", Montserrat, Corbel, "URW Gothic", source-sans-pro, sans-serif',
  HEAVY_SANS:
    'Bahnschrift, "DIN Alternate", "Franklin Gothic Medium", "Nimbus Sans Narrow", sans-serif-condensed, sans-serif',
  ROUNDED_SANS:
    'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT Bold", Calibri, source-sans-pro, sans-serif',
  MODERN_SERIF: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif',
  BOOK_SERIF: '"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, serif',
  MONOSPACE: '"Nimbus Mono PS", "Courier New", "Cutive Mono", monospace'
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Resolve a FlyHub font-family key to its CSS font stack.
 * Falls back to MODERN_SANS when the key is missing or unrecognised.
 */
export function resolveFontFamily(key?: string | null, fallback?: string): string {
  if (!key) return fallback || FONT_FAMILY_MAP.MODERN_SANS
  return FONT_FAMILY_MAP[key] || fallback || FONT_FAMILY_MAP.MODERN_SANS
}

/**
 * Convert a padding object to a CSS shorthand string (e.g. "16px 24px 16px 24px").
 * Returns a sensible default when padding is undefined.
 */
export function formatPadding(
  padding?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  } | null
): string {
  if (!padding) return '16px 24px'
  return `${padding.top ?? 16}px ${padding.right ?? 24}px ${padding.bottom ?? 16}px ${padding.left ?? 24}px`
}

// ---------------------------------------------------------------------------
// Core block types
// ---------------------------------------------------------------------------

/**
 * Style properties available on a FlyHub block.
 * Superset of all fields found across the three renderers.
 * The flyhub-html-renderer allows `null` for most style fields;
 * the others use `undefined`. Both are accepted here.
 */
export interface FlyhubBlockStyle {
  padding?: { top?: number, right?: number, bottom?: number, left?: number } | null
  textAlign?: string | 'left' | 'center' | 'right' | null
  color?: string | null
  backgroundColor?: string | null
  fontSize?: number | null
  fontFamily?: string | null
  fontWeight?: string | null
  borderColor?: string | null
  borderRadius?: number | null
  // Phase 3a — rich per-element styling (all optional; absent ⇒ unchanged
  // render). Emitted via app/utils/edmStyle.ts (extendedStyleCss) per block.
  lineHeight?: number | string | null
  letterSpacing?: number | null
  textTransform?: string | null
  opacity?: number | null
  borderWidth?: number | null
  borderStyle?: string | null
  boxShadow?: string | null
  backgroundImage?: string | null
}

export interface FlyhubMobileOverride {
  style?: Partial<FlyhubBlockStyle> | null
  props?: Record<string, unknown> | null
}

/**
 * A single block within a FlyHub document tree.
 */
export interface FlyhubBlock {
  type: string
  data: {
    props?: Record<string, unknown> | null
    style?: FlyhubBlockStyle | null
    mobile?: FlyhubMobileOverride | null
    hideOnMobile?: boolean | null
    hideOnDesktop?: boolean | null
    childrenIds?: string[]
  }
}

/**
 * Top-level FlyHub document — a keyed map of blocks with a `root` entry.
 */
export interface FlyhubDocument {
  root: FlyhubBlock
  [blockId: string]: FlyhubBlock
}

// ---------------------------------------------------------------------------
// Dynamic block configuration
// ---------------------------------------------------------------------------

export interface DynamicBlockConfig {
  id: string
  type: string
  label: string
  data: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Preview data types (superset of all three renderers)
// ---------------------------------------------------------------------------

export interface PreviewVehicle {
  id: string
  stockNumber: string
  make: string
  model: string
  year: number
  variant?: string
  price: number
  formattedPrice: string
  originalPrice?: number
  formattedOriginalPrice?: string
  savings?: number
  formattedSavings?: string
  imageUrl: string
  vehicleUrl: string
  condition?: 'new' | 'used' | 'demo'
  daysOnLot?: number
  hasPriceReduction?: boolean
  transmission?: string
  fuelType?: string
  bodyType?: string
  odometer?: number
  badges?: Array<{ type: string, text: string, color: string }>
  urgencyTier?: 'warning' | 'urgent' | 'critical'
  urgencyMessage?: string
}

export interface PreviewOffer {
  id: string
  title: string
  description: string
  type: string
  imageUrl?: string
  vehicleImageUrl?: string
  vehicleName?: string
  ctaUrl: string
  ctaText: string
  validFrom?: string
  validTo?: string
  daysRemaining?: number
  priceRetail?: number
  priceAbn?: number
  formattedPriceRetail?: string
  formattedPriceAbn?: string
  bannerText?: string
  specifications?: Array<{ text: string, iconUrl?: string }>
}

// ---------------------------------------------------------------------------
// Block render context
// ---------------------------------------------------------------------------

/**
 * Everything a block renderer needs to produce output.
 */
export interface BlockRenderContext {
  /** Dealer-level context (name, domain, colours, etc.) */
  dealerContext?: Record<string, unknown>
  /** Dynamic data keyed by block id */
  dynamicData?: {
    vehicles?: Map<string, PreviewVehicle[]>
    offers?: Map<string, PreviewOffer[]>
  }
  /** Merge fields for template interpolation (e.g. {{firstName}}) */
  mergeFields?: Record<string, string>
  /** Base URL for links (e.g. https://dealer.engager.com.au) */
  baseUrl?: string
  /** Primary brand colour */
  primaryColor: string
  /** Resolved CSS font-family string */
  fontFamily: string
  /** Document map for resolving child block IDs (set by orchestrator) */
  _document?: Record<string, FlyhubBlock>
}

// ---------------------------------------------------------------------------
// Block definition (used by the registry)
// ---------------------------------------------------------------------------

export type RenderFormat = 'mjml' | 'html' | 'maizzle'

/**
 * A registered block definition. Each block type provides at least an MJML
 * renderer and an HTML renderer. Maizzle is optional (falls back to HTML).
 */
export interface BlockDefinition {
  /** Block type identifier (e.g. "heading", "image", "vehicleGrid") */
  type: string
  /** Render block as MJML markup */
  renderMjml: (block: FlyhubBlock, context: BlockRenderContext) => string
  /** Render block as email-safe HTML (table-based) */
  renderHtml: (block: FlyhubBlock, context: BlockRenderContext) => string
  /** Render block for the Maizzle pipeline (optional — falls back to renderHtml) */
  renderMaizzle?: (block: FlyhubBlock, context: BlockRenderContext) => string
  /** Render block as MJML inside a column (no mj-section wrapper). Used by ColumnsContainer. */
  renderMjmlInline?: (block: FlyhubBlock, context: BlockRenderContext) => string
  /** Default props applied when this block type is created in the editor */
  defaultProps?: Record<string, unknown>
}
