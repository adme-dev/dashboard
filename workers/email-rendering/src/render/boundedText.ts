import { createRenderBudget, MAX_RENDER_OUTPUT_BYTES, RenderBoundaryError } from '../../../../shared/emailRendering/bounds'

type Budget = ReturnType<typeof createRenderBudget>
const encoder = new TextEncoder()

/** Charge every copy before constructing the joined string. A shared request
 * budget also stops mapped chunks accumulating before their eventual join. */
export function boundedJoin(values: readonly unknown[], separator = ',', budget: Budget = createRenderBudget()): string {
  const chunks: string[] = []
  for (let i = 0; i < values.length; i++) {
    if (i) {
      budget.charge(separator)
      chunks.push(separator)
    }
    const value = values[i] == null ? '' : String(values[i])
    budget.charge(value)
    chunks.push(value)
  }
  return chunks.join('')
}

export function boundedText(budget: Budget = createRenderBudget()) {
  return (strings: TemplateStringsArray, ...values: unknown[]): string => {
    const chunks: string[] = []
    for (let i = 0; i < strings.length; i++) {
      budget.charge(strings[i]!)
      chunks.push(strings[i]!)
      if (i < values.length) {
        const value = String(values[i])
        budget.charge(value)
        chunks.push(value)
      }
    }
    return chunks.join('')
  }
}

/** Two passes, with no expanded strings or per-match array retained in the
 * sizing pass. Callbacks are pure and return literal text (no $ substitutions).
 * Only global, non-empty patterns are supported by this private helper. */
export function boundedReplace(value: string, pattern: RegExp, replacement: (...matches: string[]) => string, budget: Budget = createRenderBudget()): string {
  if (!pattern.global) throw new Error('Expected a global replacement pattern')
  const scan = new RegExp(pattern.source, pattern.flags)
  let bytes = encoder.encode(value).byteLength
  for (let match = scan.exec(value); match; match = scan.exec(value)) {
    if (!match[0].length) throw new Error('Empty replacement match')
    const next = replacement(...match)
    bytes += encoder.encode(next).byteLength - encoder.encode(match[0]).byteLength
    if (bytes > MAX_RENDER_OUTPUT_BYTES) throw new RenderBoundaryError('LIMIT_EXCEEDED')
  }
  budget.chargeBytes(bytes)
  return value.replace(pattern, (...args) => replacement(...args.slice(0, -2) as string[]))
}
