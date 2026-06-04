// app/utils/edmStyle.ts
// Shared, framework-free style helpers for the EDM enterprise inspector (Phase 3a).
//
// The editor renderer (EdmBlockRenderer.vue) and the server renderers
// (server/utils/email-marketing/render/blocks/*) historically applied a small,
// fixed set of style props (color/bg/font*/textAlign/padding) each in their own
// way. Phase 3a adds richer per-element styling. To keep the two renderers in
// lockstep — and crucially to avoid regressing the production send path — the
// NEW props are emitted through one shared source of truth here:
//
//   • extendedStyleDeclarations(style) → ordered [prop, value] CSS pairs
//   • extendedStyleCss(style)          → inline CSS string (server renderers)
//   • extendedStyleVue(style)          → CSSProperties object (editor renderer)
//
// Design guarantee: when a prop is absent/empty, it is omitted entirely, so a
// block with no new props renders exactly as before. Only opt-in styling changes
// output. URLs and shadow values are sanitised (these end up in inline CSS).

export interface EdmExtendedStyle {
  lineHeight?: number | string | null
  letterSpacing?: number | null
  textTransform?: string | null
  opacity?: number | null
  borderWidth?: number | null
  borderStyle?: string | null
  borderColor?: string | null
  borderRadius?: number | null
  boxShadow?: string | null
  backgroundImage?: string | null
}

export const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'none'] as const
export const TEXT_TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize'] as const

// Named shadow presets (stored by key; resolved to a CSS value here).
export const SHADOW_PRESETS: Record<string, string> = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,0.06)',
  md: '0 4px 8px rgba(0,0,0,0.10)',
  lg: '0 10px 24px rgba(0,0,0,0.15)'
}
export const SHADOW_OPTIONS = ['none', 'sm', 'md', 'lg'] as const

/** Resolve a stored shadow value (preset key or 'none') to a CSS box-shadow. */
export function resolveBoxShadow(value: string | null | undefined): string | null {
  if (!value || value === 'none') return null
  return SHADOW_PRESETS[value] ?? null // unknown keys are ignored (no raw CSS passthrough)
}

/**
 * Sanitise a background-image URL for safe inline-CSS `url(...)` use.
 * Only http(s) URLs with no characters that could break out of url()/the style
 * attribute are allowed; anything else returns null (omit the declaration).
 */
export function safeCssUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const t = String(url).trim()
  if (!/^https?:\/\//i.test(t)) return null
  // disallow chars that could terminate url() or the inline style/attribute
  if (/["')(\\<>]/.test(t)) return null
  return t
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

// ── Inline-CSS value sanitisation ────────────────────────────────────────────
// Every string-valued style prop below is emitted, unescaped, inside an inline
// style="…" attribute in the PRODUCTION email-send HTML (no downstream
// sanitiser). A hostile value (from saved JSON, an imported template, or a
// free-text field) must not be able to break out of the attribute or inject
// extra declarations. Each validator returns null ⇒ the declaration is omitted.

/** A CSS color: hex, rg[b]a()/hsl[a]() with only safe inner chars, or a named color. */
export function safeCssColor(value: string | null | undefined): string | null {
  if (!value) return null
  const v = String(value).trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v
  if (/^(rgb|rgba|hsl|hsla)\([0-9.,%/\s]+\)$/i.test(v)) return v
  if (/^[a-zA-Z]{1,24}$/.test(v)) return v // named colors (e.g. "red", "transparent")
  return null
}

/** A CSS line-height: a unitless number or a number with px/em/rem/% unit. */
export function safeLineHeight(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  const v = String(value).trim()
  return /^[0-9]+(\.[0-9]+)?(px|em|rem|%)?$/.test(v) ? v : null
}

/** Restrict a value to a fixed allow-list of keywords. */
function oneOf(value: string | null | undefined, allowed: readonly string[]): string | null {
  if (!value) return null
  const v = String(value).trim().toLowerCase()
  return allowed.includes(v) ? v : null
}

/**
 * The extended-style declarations for a block, in deterministic order.
 * Returns kebab-case CSS property names paired with their CSS values. Only the
 * NEW Phase-3a props are emitted (base props stay owned by each renderer).
 * Border is emitted as a composite `border` only when a width+style are present;
 * `border-radius` is independent.
 */
export function extendedStyleDeclarations(style: EdmExtendedStyle | null | undefined): Array<[string, string]> {
  if (!style) return []
  const out: Array<[string, string]> = []

  const lh = safeLineHeight(style.lineHeight)
  if (lh !== null) out.push(['line-height', lh])

  const ls = num(style.letterSpacing)
  if (ls !== null) out.push(['letter-spacing', `${ls}px`])

  const tt = oneOf(style.textTransform, TEXT_TRANSFORMS)
  if (tt && tt !== 'none') out.push(['text-transform', tt])

  const op = num(style.opacity)
  if (op !== null && op < 1) out.push(['opacity', String(Math.max(0, Math.min(1, op)))])

  // Border: composite only when width + a valid style are present. Color is
  // validated; an unsafe/invalid color falls back to black rather than emitting
  // attacker-controlled text into the inline style attribute.
  const bw = num(style.borderWidth)
  const bs = oneOf(style.borderStyle, BORDER_STYLES)
  if (bw !== null && bw > 0 && bs && bs !== 'none') {
    const color = safeCssColor(style.borderColor) || '#000000'
    out.push(['border', `${bw}px ${bs} ${color}`])
  }
  const br = num(style.borderRadius)
  if (br !== null && br > 0) out.push(['border-radius', `${br}px`])

  const shadow = resolveBoxShadow(style.boxShadow)
  if (shadow) out.push(['box-shadow', shadow])

  const bgUrl = safeCssUrl(style.backgroundImage)
  if (bgUrl) {
    out.push(['background-image', `url(${bgUrl})`])
    out.push(['background-size', 'cover'])
    out.push(['background-position', 'center'])
  }

  return out
}

/** Inline CSS string for the extended props (server renderers). No trailing space. */
export function extendedStyleCss(style: EdmExtendedStyle | null | undefined): string {
  return extendedStyleDeclarations(style)
    .map(([prop, value]) => `${prop}: ${value};`)
    .join(' ')
}

/** CSSProperties object for the extended props (editor renderer / Vue :style). */
export function extendedStyleVue(style: EdmExtendedStyle | null | undefined): Record<string, string> {
  const camel = (p: string) => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  const out: Record<string, string> = {}
  for (const [prop, value] of extendedStyleDeclarations(style)) out[camel(prop)] = value
  return out
}
