/**
 * Client-side HTML assembly for custom HTML banner preview + variable utilities.
 */

const VAR_REGEX = /\{\{([A-Z][A-Z0-9_]*)\}\}/g

/** Extract unique variable names from code */
export function extractVariableNames(html: string, css: string, js: string): string[] {
  const source = [html, css, js].join('\n')
  const names = new Set<string>()
  let match: RegExpExecArray | null
  const regex = new RegExp(VAR_REGEX.source, 'g')
  while ((match = regex.exec(source)) !== null) {
    names.add(match[1])
  }
  return Array.from(names)
}

/** Replace {{VAR}} placeholders with values, fallback to defaults */
export function substituteVariables(
  source: string,
  values: Record<string, string>,
  defaults: Record<string, string>,
): string {
  return source.replace(VAR_REGEX, (_m, name: string) => {
    return values[name] ?? defaults[name] ?? ''
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

export interface CustomBannerPreviewOptions {
  html: string
  css: string
  js: string
  width: number
  height: number
  variableValues?: Record<string, string>
  variableDefaults?: Record<string, string>
  externalScripts?: string[]
  externalStyles?: string[]
}

/** Build a full HTML document for live iframe preview (srcdoc) */
export function buildCustomBannerPreviewHTML(opts: CustomBannerPreviewOptions): string {
  const values = opts.variableValues || {}
  const defaults = opts.variableDefaults || {}

  const html = substituteVariables(opts.html, values, defaults)
  const css = substituteVariables(opts.css, values, defaults)
  const js = substituteVariables(opts.js, values, defaults)

  const scripts = (opts.externalScripts || [])
    .filter(u => /^https:\/\//.test(u))
    .map(u => `<script src="${escapeHtml(u)}"><\/script>`)
    .join('\n  ')

  const styles = (opts.externalStyles || [])
    .filter(u => /^https:\/\//.test(u))
    .map(u => `<link rel="stylesheet" href="${escapeHtml(u)}">`)
    .join('\n  ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${opts.width}">
  ${styles}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${opts.width}px; height: ${opts.height}px; overflow: hidden; }
    .ad-container { position: relative; width: ${opts.width}px; height: ${opts.height}px; overflow: hidden; }
    ${css}
  </style>
</head>
<body>
  <div class="ad-container">
    ${html}
  </div>
  ${scripts}
  <script>
    ${js}
  <\/script>
</body>
</html>`
}
