import { createHash } from 'node:crypto'

export interface SearchAuthorityPublicationRenderInput {
  hostname: string
  slug: string
  title: string
  excerpt: string
  bodyMarkdown: string
  disclaimer: string
  schemaType: 'Article' | 'FAQPage'
  versionId: string
  publishedAt: string
  sourceLabels: Array<{ name: string, role: string }>
  claims: Array<{ claim: string, sourceType: string, sourceReference: string }>
  dealershipUrl: string
}

export interface RenderedPublication {
  html: string
  contentType: 'text/html; charset=utf-8'
  etag: string
  canonicalUrl: string
}

interface FaqPair { question: string, answer: string }

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function renderSearchAuthorityPublication(
  input: SearchAuthorityPublicationRenderInput
): RenderedPublication {
  const hostname = input.hostname.trim().toLowerCase()
  if (!HOSTNAME.test(hostname)) throw new Error('A valid publication hostname is required')
  if (!SLUG.test(input.slug)) throw new Error('A valid publication slug is required')
  const dealershipUrl = new URL(input.dealershipUrl)
  if (dealershipUrl.protocol !== 'https:' || dealershipUrl.username || dealershipUrl.password) {
    throw new Error('The dealership URL must be public HTTPS without credentials')
  }

  const canonicalUrl = `https://${hostname}/guides/${input.slug}`
  const visibleBody = renderMarkdown(input.bodyMarkdown)
  const faqPairs = extractFaqPairs(input.bodyMarkdown)
  const schema = input.schemaType === 'FAQPage' && faqPairs.length >= 2
    ? faqSchema(canonicalUrl, faqPairs)
    : articleSchema(input, canonicalUrl)
  const sourceLabels = input.sourceLabels.map(source => (
    `<li>${escapeHtml(source.name)} <span>· ${escapeHtml(source.role)}</span></li>`
  )).join('')
  const claimLabels = input.claims.map(claim => (
    `<li><strong>${escapeHtml(claim.claim)}</strong><span>${escapeHtml(sourceTypeLabel(claim.sourceType))} · ${escapeHtml(claim.sourceReference)}</span></li>`
  )).join('')
  const html = `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(input.title)} | Knox GWM</title>
  <meta name="description" content="${escapeAttribute(input.excerpt)}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeAttribute(input.title)}">
  <meta property="og:description" content="${escapeAttribute(input.excerpt)}">
  <meta property="og:url" content="${canonicalUrl}">
  <script type="application/ld+json">${safeJson(schema)}</script>
  <style>${publicationCss()}</style>
</head>
<body>
  <header class="masthead"><a href="${escapeAttribute(dealershipUrl.href)}">Knox GWM Haval</a><span>Buying guides</span></header>
  <main>
    <article>
      <p class="eyebrow">Source-backed dealership guidance</p>
      <h1>${escapeHtml(input.title)}</h1>
      <p class="lede">${escapeHtml(input.excerpt)}</p>
      <div class="guide-body">${visibleBody}</div>
      <aside class="disclaimer"><h2>Important information</h2><p>${escapeHtml(input.disclaimer)}</p></aside>
      <section class="evidence"><h2>Sources reviewed</h2><ul>${sourceLabels}</ul><h2>Claims checked</h2><ul>${claimLabels}</ul></section>
      <a class="cta" href="${escapeAttribute(dealershipUrl.href)}">Confirm current details with Knox GWM</a>
    </article>
  </main>
  <footer>Publication version ${escapeHtml(input.versionId)}</footer>
</body>
</html>`

  return {
    html,
    contentType: 'text/html; charset=utf-8',
    etag: createHash('sha256').update(html, 'utf8').digest('hex'),
    canonicalUrl
  }
}

export function renderPublicationSitemap(canonicalUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeXml(canonicalUrl)}</loc></url></urlset>`
}

export function renderPublicationRobots(hostname: string): string {
  return `User-agent: *\nAllow: /\nSitemap: https://${hostname}/sitemap.xml\n`
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  const output: string[] = []
  let paragraph: string[] = []
  let list: 'ul' | 'ol' | null = null
  let inCode = false
  let code: string[] = []

  const closeParagraph = () => {
    if (paragraph.length) output.push(`<p>${inline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const closeList = () => {
    if (list) output.push(`</${list}>`)
    list = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (line.trim().startsWith('```')) {
      closeParagraph()
      closeList()
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = []
      }
      inCode = !inCode
      continue
    }
    if (inCode) {
      code.push(rawLine)
      continue
    }
    if (!line.trim()) {
      closeParagraph()
      closeList()
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      closeParagraph()
      closeList()
      const level = heading[1]!.length + 1
      output.push(`<h${level}>${inline(heading[2]!)}</h${level}>`)
      continue
    }
    const unordered = /^[-*]\s+(.+)$/.exec(line)
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line)
    if (unordered || ordered) {
      closeParagraph()
      const next = unordered ? 'ul' : 'ol'
      if (list !== next) {
        closeList()
        list = next
        output.push(`<${list}>`)
      }
      output.push(`<li>${inline((unordered || ordered)![1]!)}</li>`)
      continue
    }
    closeList()
    paragraph.push(line.trim())
  }
  if (inCode) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  closeParagraph()
  closeList()
  return output.join('\n')
}

function extractFaqPairs(markdown: string): FaqPair[] {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  const pairs: FaqPair[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^##\s+(.+\?)\s*$/.exec(lines[index]!.trim())
    if (!match) continue
    const answer: string[] = []
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]!.trim()
      if (/^#{1,3}\s+/.test(line)) break
      if (line) answer.push(line)
    }
    if (answer.length) pairs.push({ question: match[1]!, answer: answer.join(' ') })
  }
  return pairs.slice(0, 20)
}

function articleSchema(input: SearchAuthorityPublicationRenderInput, canonicalUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': input.title,
    'description': input.excerpt,
    'datePublished': input.publishedAt,
    'dateModified': input.publishedAt,
    'mainEntityOfPage': canonicalUrl,
    'author': input.sourceLabels.map(source => ({ '@type': 'Person', 'name': source.name, 'jobTitle': source.role })),
    'publisher': { '@type': 'Organization', 'name': 'Knox GWM Haval', 'url': input.dealershipUrl }
  }
}

function faqSchema(canonicalUrl: string, pairs: FaqPair[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'url': canonicalUrl,
    'mainEntity': pairs.map(pair => ({
      '@type': 'Question',
      'name': pair.question,
      'acceptedAnswer': { '@type': 'Answer', 'text': pair.answer }
    }))
  }
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function sourceTypeLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('`', '&#96;')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function escapeXml(value: string): string {
  return escapeHtml(value)
}

function publicationCss(): string {
  return `:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f5f6f7;color:#17191d}*{box-sizing:border-box}body{margin:0}.masthead{display:flex;justify-content:space-between;gap:1rem;padding:1.25rem max(1.25rem,calc((100vw - 72rem)/2));background:#101216;color:#fff}.masthead a{color:inherit;font-weight:700;text-decoration:none}.masthead span{color:#b8bec8}main{padding:clamp(2rem,6vw,5rem) 1.25rem}article{max-width:48rem;margin:auto;background:#fff;border:1px solid #e2e5e9;border-radius:1.25rem;padding:clamp(1.5rem,5vw,4rem);box-shadow:0 1.25rem 4rem #11182712}.eyebrow{color:#875b13;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{font-size:clamp(2.2rem,7vw,4.5rem);line-height:1.02;letter-spacing:-.045em;margin:.7rem 0 1rem}.lede{font-size:1.2rem;line-height:1.7;color:#525762}.guide-body{margin-top:2.5rem}.guide-body h2,.guide-body h3{margin-top:2.25rem;line-height:1.2}.guide-body p,.guide-body li{line-height:1.8}.guide-body pre{overflow:auto;padding:1rem;background:#101216;color:#f6f7f9;border-radius:.75rem}.disclaimer,.evidence{margin-top:2.5rem;padding:1.25rem;border-radius:.85rem;background:#f0f2f4}.disclaimer h2,.evidence h2{font-size:1rem;margin:.1rem 0 .65rem}.evidence ul{padding-left:1.2rem}.evidence li{margin:.7rem 0}.evidence li span{display:block;color:#646b75;font-size:.8rem}.cta{display:inline-block;margin-top:2rem;padding:.9rem 1.2rem;border-radius:.65rem;background:#17191d;color:#fff;text-decoration:none;font-weight:700}footer{padding:2rem;text-align:center;color:#737a84;font-size:.75rem}@media(prefers-color-scheme:dark){:root{background:#090a0d;color:#f7f7f8}article{background:#121419;border-color:#282c33}.lede,.evidence li span,footer{color:#aeb4be}.disclaimer,.evidence{background:#1b1e24}.cta{background:#f4f5f7;color:#111318}}`
}
