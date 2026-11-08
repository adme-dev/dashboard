import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { createRenderBudget, RenderBoundaryError } from './bounds'

type MergeOptions = {
  context?: 'html' | 'text'
  missing?: 'preserve' | 'empty'
  /** Compiled HTML has already encoded authored fallback text once. */
  fallbackEncoding?: 'html'
  budget?: { charge(value: string): void }
}
const compiledFallbackEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"' }
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#039;' }
const unresolvedHrefToken = /^\{\{[^{}]{1,2304}\}\}$/
type HtmlChild = DefaultTreeAdapterMap['childNode']
type HtmlElement = DefaultTreeAdapterMap['element']
type HtmlComment = DefaultTreeAdapterMap['commentNode']
type HtmlTemplate = DefaultTreeAdapterMap['template']

function isDangerousHref(value: string): boolean {
  const inspected = value.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (!inspected || unresolvedHrefToken.test(inspected)) return false
  try {
    const protocol = new URL(inspected).protocol
    if (protocol === 'javascript:' || protocol === 'data:' || protocol === 'vbscript:') return true
  } catch { /* A non-absolute value can still be a raw scheme after control removal. */ }
  return /^(javascript|data|vbscript):/i.test(inspected)
}

function hrefSpans(html: string, base: number, depth: number): Array<{ start: number, end: number }> {
  if (depth > 4) return []
  const spans: Array<{ start: number, end: number }> = []
  const visit = (node: HtmlChild) => {
    if (node.nodeName === '#comment') {
      const comment = node as HtmlComment
      const location = comment.sourceCodeLocation
      if (location && comment.data.toLowerCase().includes('href')) {
        spans.push(...hrefSpans(comment.data, base + location.startOffset + 4, depth + 1))
      }
      return
    }
    if (!('attrs' in node)) return
    const element = node as HtmlElement
    const href = element.attrs.find(attribute => attribute.name === 'href')
    const location = element.sourceCodeLocation?.attrs?.href
    if (href && location && isDangerousHref(href.value)) {
      spans.push({ start: base + location.startOffset, end: base + location.endOffset })
    }
    const content = node.nodeName === 'template' ? (node as HtmlTemplate).content.childNodes : []
    for (const child of [...element.childNodes, ...content]) visit(child)
  }
  for (const child of parseFragment(html, { sourceCodeLocationInfo: true }).childNodes) visit(child)
  return spans
}

/** After HTML merge, replace hrefs whose parsed URL is a scriptable scheme.
 * parse5 decodes character references and reads unquoted attributes. Only those
 * attribute spans change; unresolved tokens and every other byte stay. */
export function neutralizeResolvedHrefSchemes(html: string): string {
  const spans = hrefSpans(html, 0, 0).sort((left, right) => right.start - left.start)
  let result = html
  for (const span of spans) {
    if (span.start < 0 || span.end > result.length || span.start >= span.end) continue
    result = `${result.slice(0, span.start)}href="#"${result.slice(span.end)}`
  }
  return result
}

/** One bounded pass over the authored template. Recipient values are literal
 * data: never replacement-string instructions or a second template to evaluate.
 * HTML encoding is for text and attribute values. After that encoding, parse5
 * reads each href, including character references and unquoted attributes, and
 * a scriptable scheme is replaced once. Subjects use the plain-text context. */
export function resolveEmailMergeTags(template: string, variables: Record<string, string>, options: MergeOptions = {}): string {
  const budget = options.budget ?? createRenderBudget()
  const values = new Map(Object.entries(variables).map(([key, value]) => [key.toLowerCase().trim(), value]))
  const chunks: string[] = []
  let visits = 0
  const append = (value: string) => {
    if (++visits > 100_000) throw new RenderBoundaryError('LIMIT_EXCEEDED')
    budget.charge(value)
    chunks.push(value)
  }
  const replacement = (value: string) => {
    if (options.context === 'text') return append(value)
    let cursor = 0
    for (const match of value.matchAll(/[&<>"']/g)) {
      append(value.slice(cursor, match.index))
      append(entities[match[0]]!)
      cursor = match.index! + 1
    }
    append(value.slice(cursor))
  }
  let cursor = 0
  // Bound the entire token before trimming whitespace or parsing a fallback;
  // overlapping unbounded whitespace expressions can backtrack on malformed tags.
  const tokens = options.fallbackEncoding === 'html' ? /\{\{([^{}]{1,2304})\}\}/g : /\{\{([^{}]{1,384})\}\}/g
  for (const match of template.matchAll(tokens)) {
    append(template.slice(cursor, match.index))
    const body = match[1]!
    const divider = body.indexOf('|')
    const key = (divider < 0 ? body : body.slice(0, divider)).trim().toLowerCase()
    const authoredFallback = divider < 0 ? undefined : body.slice(divider + 1).trim()
    // Decode only the compiler's five escape forms, exactly once. This is
    // plain fallback data, never HTML parsing or recursive token evaluation.
    const fallback = authoredFallback === undefined || options.fallbackEncoding !== 'html'
      ? authoredFallback
      : authoredFallback.replace(/&(amp|lt|gt|quot|#0*39|#x0*27);/gi, (_entity, name: string) => compiledFallbackEntities[name.toLowerCase()] ?? '\'')
    if (!key || key.length > 128 || (fallback !== undefined && fallback.length > 256)) {
      append(match[0])
    } else {
      const value = values.get(key)
      if (value) replacement(value)
      else if (fallback !== undefined) replacement(fallback)
      else if (value !== undefined || options.missing === 'empty') append('')
      else append(match[0])
    }
    cursor = match.index! + match[0].length
  }
  append(template.slice(cursor))
  const resolved = chunks.join('')
  return options.context === 'text' ? resolved : neutralizeResolvedHrefSchemes(resolved)
}
