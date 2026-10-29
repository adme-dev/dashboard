/**
 * FlyHub font-key map. Pure data: no renderer, registry, or runtime imports.
 * The private email-rendering Worker re-exports this. The editor preview
 * imports it directly so Pages never pulls in workers/email-rendering/src.
 */

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

const DEFAULT_FONT_FAMILY = FONT_FAMILY_MAP.MODERN_SANS || '"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif'

/**
 * Resolve a FlyHub font-family key to its CSS font stack.
 * Falls back to MODERN_SANS when the key is missing or unrecognised.
 * Unknown strings are not passed through: callers that already hold a CSS
 * stack must not send it here.
 */
export function resolveFontFamily(key?: string | null, fallback?: string): string {
  const fallbackFont = fallback || DEFAULT_FONT_FAMILY
  if (!key) return fallbackFont
  return FONT_FAMILY_MAP[key] || fallbackFont
}

/**
 * Canvas preview only. Known keys become the same stacks the Worker emits.
 * A value that is already a CSS stack is left unchanged. Blank stays unset
 * so the preview inherits instead of forcing a face.
 */
export function previewFontFamily(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return FONT_FAMILY_MAP[value] || value
}
