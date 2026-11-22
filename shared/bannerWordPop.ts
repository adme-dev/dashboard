/** Split editable copy into stable word targets while keeping its whitespace. */
export function bannerWordTokens(text: string, unit: 'word' | 'character' = 'word'): Array<{ text: string, wordIndex: number | null }> {
  let index = 0
  return (unit === 'character' ? Array.from(text) : text.match(/\s+|\S+/gu) || []).map(token => ({
    text: token,
    wordIndex: /^\s+$/u.test(token) ? null : index++
  }))
}
