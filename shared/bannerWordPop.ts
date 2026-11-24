/** Split editable copy into stable word targets while keeping its whitespace. */
export function bannerWordTokens(text: string, unit: 'word' | 'character' = 'word'): Array<{ text: string, wordIndex: number | null }> {
  let index = 0
  return (unit === 'character' ? Array.from(text) : text.match(/\s+|\S+/gu) || []).map(token => ({
    text: token,
    wordIndex: /^\s+$/u.test(token) ? null : index++
  }))
}

/** Keep inline typography inside each animated word, including raised footnotes. */
export function bannerWordRuns(text: string, unit: 'word' | 'character' = 'word', runs?: Array<{ text: string, fontSize?: number, top?: number }>) {
  const source = runs?.map(run => run.text).join('') === text ? runs : undefined
  let offset = 0
  return bannerWordTokens(text, unit).map((token) => {
    const from = offset
    offset += token.text.length
    let cursor = 0
    const fragments = source?.flatMap((run) => {
      const start = cursor
      cursor += run.text.length
      const left = Math.max(from, start), right = Math.min(offset, cursor)
      return right > left ? [{ ...run, text: run.text.slice(left - start, right - start) }] : []
    }) || [{ text: token.text }]
    return { ...token, runs: fragments }
  })
}
