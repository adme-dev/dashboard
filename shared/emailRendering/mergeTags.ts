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

/** One bounded pass over the authored template. Recipient values are literal
 * data: never replacement-string instructions or a second template to evaluate.
 * HTML encoding is for text/quoted attributes; URL ownership remains with the
 * existing field and asset contracts. Subjects use the plain-text context. */
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
  return chunks.join('')
}
