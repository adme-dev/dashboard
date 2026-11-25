import { bannerFontFamily, type BannerFontChoice } from './banner/fonts'
import { isBannerInlineTextColor, isBannerInlineTextGradient } from './bannerTextColor.mjs'

export interface BannerTextRun extends BannerFontChoice {
  text: string
  fontSize?: number
  top?: number
  color?: string
  decoration?: 'line-through'
  gradient?: string
}

export function bannerTextRunStyle(run: BannerTextRun) {
  const family = typeof run.fontFamily === 'string' && /^[\w .-]{1,150}$/.test(run.fontFamily) ? bannerFontFamily(run.fontFamily, run.fontAssetId) : undefined
  const weight = run.fontWeight
  const gradient = isBannerInlineTextGradient(run.gradient) ? run.gradient : undefined
  return {
    textDecoration: run.decoration === 'line-through' ? run.decoration : undefined,
    fontFamily: family ? `'${family}',sans-serif` : undefined,
    fontWeight: typeof weight === 'number' && Number.isInteger(weight) && weight >= 1 && weight <= 1000 ? weight : undefined,
    fontStyle: run.fontStyle === 'italic' || run.fontStyle === 'normal' ? run.fontStyle : undefined,
    fontSize: run.fontSize ? `${run.fontSize}px` : undefined,
    position: run.top !== undefined ? 'relative' as const : undefined,
    top: run.top !== undefined ? `${run.top}px` : undefined,
    color: gradient ? 'transparent' : isBannerInlineTextColor(run.color) ? run.color : undefined,
    ...(gradient ? { backgroundImage: gradient, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : {})
  }
}

export function bannerTextRunCss(run: BannerTextRun) {
  const { fontSize, position, top, color, fontFamily, fontWeight, fontStyle, backgroundImage, textDecoration } = bannerTextRunStyle(run)
  return `${textDecoration ? 'text-decoration:line-through;' : ''}${fontSize ? `font-size:${fontSize};` : ''}${position ? `position:${position};top:${top};` : ''}${color ? `color:${color};` : ''}${fontFamily ? `font-family:${fontFamily};` : ''}${fontWeight ? `font-weight:${fontWeight};` : ''}${fontStyle ? `font-style:${fontStyle};` : ''}${backgroundImage ? `background-image:${backgroundImage};background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;` : ''}`
}

/** Split editable copy into stable word targets while keeping its whitespace. */
export function bannerWordTokens(text: string, unit: 'word' | 'character' = 'word'): Array<{ text: string, wordIndex: number | null }> {
  let index = 0
  return (unit === 'character' ? Array.from(text) : text.match(/\s+|\S+/gu) || []).map(token => ({
    text: token,
    wordIndex: /^\s+$/u.test(token) ? null : index++
  }))
}

/** Keep inline typography inside each animated word, including raised footnotes. */
export function bannerWordRuns(text: string, unit: 'word' | 'character' = 'word', runs?: BannerTextRun[]) {
  const source = runs?.map(run => run.text).join('') === text ? runs : undefined
  let offset = 0
  return bannerWordTokens(text, unit).map((token) => {
    const from = offset
    offset += token.text.length
    let cursor = 0
    const fragments: Array<BannerTextRun & { sourceRunIndex?: number }> = source?.flatMap((run, sourceRunIndex) => {
      const start = cursor
      cursor += run.text.length
      const left = Math.max(from, start), right = Math.min(offset, cursor)
      return right > left ? [{ ...run, sourceRunIndex, text: run.text.slice(left - start, right - start) }] : []
    }) || [{ text: token.text }]
    return { ...token, runs: fragments }
  })
}
