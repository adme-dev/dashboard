/** Split editable copy into stable word targets while keeping its whitespace. */
export function bannerWordTokens(text: string): Array<{ text: string, wordIndex: number | null }> {
  let index = 0
  return (text.match(/\s+|\S+/gu) || []).map(token => ({
    text: token,
    wordIndex: /^\s+$/u.test(token) ? null : index++,
  }))
}
