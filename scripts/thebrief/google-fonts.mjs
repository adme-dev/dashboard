import { Window } from 'happy-dom'
import { createHash } from 'node:crypto'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function allowedUrl(value, host, path) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || url.hash || !path.test(url.pathname)) throw new Error('Unapproved font resource URL')
  return url.href
}
async function boundedFetch(url, limit, fetcher) {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'XeroFlow-TheBrief-Font-Snapshot/1.0' } })
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) throw new Error('Font resource unavailable or too large')
  const chunks = [], reader = response.body.getReader()
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new Error('Font resource exceeds byte limit')
      chunks.push(Buffer.from(value))
    }
  } finally { await reader.cancel() }
  return Buffer.concat(chunks)
}

/** Preparation-time only: snapshot full static faces, never execute source CSS/JS. */
export async function resolveGoogleFonts(stylesheets, fetcher = fetch) {
  if (stylesheets.length > 8) throw new Error('Too many external font stylesheets')
  const fonts = [], receipts = []
  const window = new Window({ settings: { enableJavaScriptEvaluation: false, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } })
  try {
    for (const input of new Set(stylesheets)) {
      const url = allowedUrl(input, 'fonts.googleapis.com', /^\/css2?$/)
      // Subsets for existing text would make subsequent editing lose glyphs.
      if (new URL(url).searchParams.has('text')) throw new Error('Text-subset fonts cannot provide reusable editable text')
      const bytes = await boundedFetch(url, 128 * 1024, fetcher)
      const element = window.document.createElement('style')
      element.textContent = bytes.toString('utf8')
      window.document.head.append(element)
      const rules = [...element.sheet.cssRules]
      if (!rules.length || rules.some(rule => rule.type !== 5)) throw new Error('Unexpected external font stylesheet content')
      for (const rule of rules) {
        const css = rule.style
        const family = css.fontFamily.replace(/^["']|["']$/g, '')
        const weight = Number(css.fontWeight)
        if (!/^[\w -]{1,80}$/.test(family) || !Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100 || css.fontStyle !== 'normal' || css.getPropertyValue('unicode-range')) throw new Error('Unsupported external font face or subset')
        const match = /^url\(["']?([^"')]+)["']?\)\s+format\(["'](truetype|opentype|woff2?)["']\)$/.exec(css.getPropertyValue('src').trim())
        if (!match) throw new Error('Unsupported external font source')
        const resource = allowedUrl(match[1], 'fonts.gstatic.com', /^\/s\/[a-zA-Z0-9/_-]+\.(ttf|otf|woff2?)$/)
        if (fonts.some(font => font.family === family && font.weight === weight)) throw new Error('Ambiguous external font face')
        if (fonts.length >= 32) throw new Error('Too many external font faces')
        const data = await boundedFetch(resource, 5 * 1024 * 1024, fetcher)
        const signature = { truetype: '00010000', opentype: '4f54544f', woff: '774f4646', woff2: '774f4632' }[match[2]]
        if (data.length < 12 || data.subarray(0, 4).toString('hex') !== signature) throw new Error('Font bytes do not match declared format')
        const sha256 = hash(data), extension = { truetype: 'ttf', opentype: 'otf', woff: 'woff', woff2: 'woff2' }[match[2]]
        fonts.push({ family, weight, style: 'normal', format: match[2], path: `./external-fonts/${sha256}.${extension}`, bytes: data })
        receipts.push({ stylesheet: url, stylesheetSha256: hash(bytes), url: resource, family, weight, sha256, bytes: data.length })
      }
      element.remove()
    }
    return { fonts, receipts }
  } finally { await window.happyDOM.close() }
}
