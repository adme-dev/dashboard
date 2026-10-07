import { RenderBoundaryError } from '../../../../shared/emailRendering/bounds'

/** Merge keys are literal names. Charge every output chunk before joining, even
 * replacement-string prefix/suffix substitutions that can amplify input. */
export function replaceMergeFields(html: string, variables: Record<string, string>, budget?: { charge(value: string): void }): string {
  let chunksVisited = 0
  for (const [key, value] of Object.entries(variables)) {
    budget?.charge(html)
    const token = `{{${key}}}`
    const chunks: string[] = []
    const append = (chunk: string) => {
      if (++chunksVisited > 100_000) throw new RenderBoundaryError('LIMIT_EXCEEDED')
      budget?.charge(chunk)
      chunks.push(chunk)
    }
    let cursor = 0
    let index = html.indexOf(token)
    if (index < 0) continue
    while (index >= 0) {
      append(html.slice(cursor, index))
      // Match JavaScript replacement strings without interpreting the key as a
      // regular expression or constructing an unbounded intermediate result.
      let valueCursor = 0
      for (const match of value.matchAll(/\$([$&`'])/g)) {
        append(value.slice(valueCursor, match.index))
        append(match[1] === '$' ? '$' : match[1] === '&' ? token : match[1] === '`' ? html.slice(0, index) : html.slice(index + token.length))
        valueCursor = match.index! + 2
      }
      append(value.slice(valueCursor))
      cursor = index + token.length
      index = html.indexOf(token, cursor)
    }
    append(html.slice(cursor))
    html = chunks.join('')
  }
  return html
}
