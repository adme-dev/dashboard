/**
 * Custom HTML Template utilities — variable detection, substitution, HTML assembly.
 */

const VAR_REGEX = /\{\{([A-Z][A-Z0-9_]*)\}\}/g
const HEX_COLOR = /^#([0-9a-fA-F]{3,8})$/
const URL_PATTERN = /^https?:\/\//i

interface TemplateVariable {
  name: string
  label: string
  type: 'text' | 'color' | 'url' | 'number'
  default: string
  group?: string
}

/** Detect type from a default value */
function inferType(value: string): 'text' | 'color' | 'url' | 'number' {
  if (HEX_COLOR.test(value)) return 'color'
  if (URL_PATTERN.test(value)) return 'url'
  if (/^-?\d+(\.\d+)?$/.test(value)) return 'number'
  return 'text'
}

/** Convert VARIABLE_NAME to Title Case label */
function nameToLabel(name: string): string {
  return name
    .split('_')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Scan HTML, CSS, JS for {{VARIABLE_NAME}} patterns.
 * Returns unique variables with auto-detected types from defaults.
 */
export function detectVariables(
  html: string,
  css: string,
  js: string,
  existingDefaults?: Record<string, string>,
): TemplateVariable[] {
  const source = [html, css, js].join('\n')
  const seen = new Set<string>()
  const vars: TemplateVariable[] = []

  let match: RegExpExecArray | null
  const regex = new RegExp(VAR_REGEX.source, 'g')
  while ((match = regex.exec(source)) !== null) {
    const name = match[1] as string
    if (seen.has(name)) continue
    seen.add(name)

    const defaultVal = existingDefaults?.[name] || ''
    vars.push({
      name,
      label: nameToLabel(name),
      type: defaultVal ? inferType(defaultVal) : 'text',
      default: defaultVal,
    })
  }

  return vars
}

/**
 * Replace {{VAR}} placeholders with values, falling back to defaults.
 * HTML-escapes values when `escapeHtml` is true (default).
 */
export function substituteVariables(
  source: string,
  values: Record<string, string>,
  defaults: Record<string, string>,
  escape = true,
): string {
  return source.replace(VAR_REGEX, (_match, name: string) => {
    const raw = values[name] ?? defaults[name] ?? ''
    return escape ? escapeHtml(raw) : raw
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape for CSS context — prevent </style> breakout */
function escapeCss(str: string): string {
  return str.replace(/<\//gi, '<\\/')
}

/** Escape for JS context — prevent </script> breakout */
function escapeJs(str: string): string {
  return str.replace(/<\//gi, '<\\/')
}

interface AssembleOptions {
  html: string
  css: string
  js: string
  width: number
  height: number
  variables?: TemplateVariable[]
  variableValues?: Record<string, string>
  externalScripts?: string[]
  externalStyles?: string[]
  clickUrl?: string
  impressionPixel?: string
  clickPixel?: string
}

/**
 * Build a complete HTML5 document from custom template parts.
 */
export function assembleCustomBannerHTML(opts: AssembleOptions): string {
  const defaults: Record<string, string> = {}
  for (const v of opts.variables || []) {
    defaults[v.name] = v.default
  }

  const values = opts.variableValues || {}

  // Substitute variables in all code sections with context-appropriate escaping
  const html = substituteVariables(opts.html, values, defaults, true)
  // CSS/JS: no HTML escaping but prevent </style> and </script> breakout
  const css = escapeCss(substituteVariables(opts.css, values, defaults, false))
  const js = escapeJs(substituteVariables(opts.js, values, defaults, false))

  // External resources — HTTPS only
  const scripts = (opts.externalScripts || [])
    .filter(u => /^https:\/\//.test(u))
    .map(u => `<script src="${escapeHtml(u)}"><\/script>`)
    .join('\n  ')

  const styles = (opts.externalStyles || [])
    .filter(u => /^https:\/\//.test(u))
    .map(u => `<link rel="stylesheet" href="${escapeHtml(u)}">`)
    .join('\n  ')

  // Tracking pixels
  const pixels: string[] = []
  if (opts.impressionPixel && /^https?:\/\//.test(opts.impressionPixel)) {
    pixels.push(`<img src="${escapeHtml(opts.impressionPixel)}" width="1" height="1" style="position:absolute;opacity:0;" alt="">`)
  }

  // Click wrapper
  const clickOpen = opts.clickUrl && /^https?:\/\//.test(opts.clickUrl)
    ? `<a href="${escapeHtml(opts.clickUrl)}" target="_blank" rel="noopener" style="display:block;width:${opts.width}px;height:${opts.height}px;position:relative;text-decoration:none;color:inherit;">`
    : ''
  const clickClose = clickOpen ? '</a>' : ''

  // Click pixel
  if (opts.clickPixel && /^https?:\/\//.test(opts.clickPixel) && clickOpen) {
    pixels.push(`<img src="${escapeHtml(opts.clickPixel)}" width="1" height="1" style="position:absolute;opacity:0;" alt="">`)
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${opts.width}">
  <meta name="ad.size" content="width=${opts.width},height=${opts.height}">
  ${styles}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${opts.width}px; height: ${opts.height}px; overflow: hidden; }
    .ad-container { position: relative; width: ${opts.width}px; height: ${opts.height}px; overflow: hidden; }
    ${css}
  </style>
</head>
<body>
  ${clickOpen}
  <div class="ad-container">
    ${html}
  </div>
  ${clickClose}
  ${pixels.join('\n  ')}
  ${scripts}
  <script>
    ${js}
  <\/script>
</body>
</html>`
}

/** Category whitelist for server-side validation */
export const CUSTOM_TEMPLATE_CATEGORIES = [
  'event-entertainment',
  'product-ecommerce',
  'brand-corporate',
  'social-lifestyle',
  'typography-kinetic',
  'abstract-artistic',
] as const

export type CustomTemplateCategory = typeof CUSTOM_TEMPLATE_CATEGORIES[number]

/** Max code size limits (bytes) */
export const CODE_SIZE_LIMITS = {
  html: 500 * 1024, // 500KB
  css: 200 * 1024,  // 200KB
  js: 200 * 1024,   // 200KB
} as const
