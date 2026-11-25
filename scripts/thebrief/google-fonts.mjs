import { Window } from 'happy-dom'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function allowedUrl(value, host, path) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || url.hash || !path.test(url.pathname)) throw new Error('Unapproved font resource URL')
  return url.href
}
// Each group owns this private temporary cache. Keep the cache bounded even
// when all layouts reference distinct remote faces.
async function boundedFetch(url, limit, fetcher, cache) {
  const path = cache && join(cache, hash(Buffer.from(url)))
  if (path) {
    const cached = await readFile(path).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
    if (cached) {
      if (cached.length > limit) throw new Error('Cached font resource exceeds byte limit')
      return cached
    }
  }
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
  const bytes = Buffer.concat(chunks)
  if (path && (await readdir(cache)).length < 48) await writeFile(path, bytes, { mode: 0o600 })
  return bytes
}

/** Preparation-time only: snapshot full static faces, never execute source CSS/JS. */
export async function resolveGoogleFonts(stylesheets, fetcher = fetch, cache) {
  if (stylesheets.length > 8) throw new Error('Too many external font stylesheets')
  const fonts = [], receipts = []
  const window = new Window({ settings: { enableJavaScriptEvaluation: false, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } })
  try {
    for (const input of new Set(stylesheets)) {
      const url = allowedUrl(input.replace(/&family=:wght@0(?=&|$)/g, ''), 'fonts.googleapis.com', /^\/css2?$/)
      // Subsets for existing text would make subsequent editing lose glyphs.
      if (new URL(url).searchParams.has('text')) throw new Error('Text-subset fonts cannot provide reusable editable text')
      const bytes = await boundedFetch(url, 128 * 1024, fetcher, cache)
      const element = window.document.createElement('style')
      element.textContent = bytes.toString('utf8')
      window.document.head.append(element)
      const rules = [...element.sheet.cssRules]
      if (!rules.length || rules.some(rule => rule.type !== 5)) throw new Error('Unexpected external font stylesheet content')
      for (const rule of rules) {
        const css = rule.style
        const family = css.fontFamily.replace(/^["']|["']$/g, '')
        const weight = Number(css.fontWeight)
        const style = css.fontStyle
        if (!/^[\w -]{1,80}$/.test(family) || !Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100 || !['normal', 'italic'].includes(style) || css.getPropertyValue('unicode-range')) throw new Error('Unsupported external font face or subset')
        const match = /^url\(["']?([^"')]+)["']?\)\s+format\(["'](truetype|opentype|woff2?)["']\)$/.exec(css.getPropertyValue('src').trim())
        if (!match) throw new Error('Unsupported external font source')
        const resource = allowedUrl(match[1], 'fonts.gstatic.com', /^\/s\/[a-zA-Z0-9/_-]+\.(ttf|otf|woff2?)$/)
        if (fonts.some(font => font.family === family && font.weight === weight && font.style === style)) throw new Error('Ambiguous external font face')
        if (fonts.length >= 32) throw new Error('Too many external font faces')
        const data = await boundedFetch(resource, 5 * 1024 * 1024, fetcher, cache)
        const signature = { truetype: '00010000', opentype: '4f54544f', woff: '774f4646', woff2: '774f4632' }[match[2]]
        if (data.length < 12 || data.subarray(0, 4).toString('hex') !== signature) throw new Error('Font bytes do not match declared format')
        const sha256 = hash(data), extension = { truetype: 'ttf', opentype: 'otf', woff: 'woff', woff2: 'woff2' }[match[2]]
        fonts.push({ family, weight, style, format: match[2], path: `./external-fonts/${sha256}.${extension}`, bytes: data })
        receipts.push({ stylesheet: url, stylesheetSha256: hash(bytes), url: resource, family, weight, style, sha256, bytes: data.length })
      }
      element.remove()
    }
    return { fonts, receipts }
  } finally { await window.happyDOM.close() }
}
