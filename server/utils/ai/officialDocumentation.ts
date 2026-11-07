import { createHash } from 'node:crypto'
import { parse } from 'parse5'
import { createError } from 'h3'
import { assertPublicSiteOrigin, createCloudflareDohResolver, type SiteIntelligenceDnsResolver } from '~~/server/utils/siteIntelligence/urlPolicy'
import type { OfficialDocumentationResult } from '~~/shared/types/officialDocumentation'

// Official help centres embed sizeable application shells; bound the transfer
// while retaining a much smaller extracted reference excerpt.
const MAX_BYTES = 2 * 1024 * 1024
const MAX_TEXT = 12_000
const TIMEOUT_MS = 10_000
const REPOSITORIES: Record<string, string> = {
  'openai/plugins': 'openai',
  'anthropics/skills': 'anthropic',
  'anthropics/knowledge-work-plugins': 'anthropic'
}
const SOURCES = [
  ['cloudflare', 'developers.cloudflare.com', /^\/(agents|workers|pages|workers-ai|ai-gateway)(\/|$)/],
  ['google', 'developers.google.com', /^\/(google-ads|merchant-center|analytics|tag-platform)(\/|$)/],
  ['google', 'support.google.com', /^\/(google-ads|adspolicy|merchants|analytics)(\/|$)/],
  ['meta', 'developers.facebook.com', /^\/(docs\/(marketing-api|marketing-apis|graph-api)|documentation\/ads-commerce\/marketing-api)(\/|$)/],
  ['meta', 'transparency.meta.com', /^\/policies\/ad-standards(\/|$)/],
  ['tiktok', 'ads.tiktok.com', /^\/(help|resources\/help)(\/|$)/],
  ['tiktok', 'business-api.tiktok.com', /^\/portal\/docs(\/|$)/],
  ['tiktok', 'developers.tiktok.com', /^\/doc(\/|$)/],
  ['microsoft', 'learn.microsoft.com', /^\/[a-z]{2}-[a-z]{2}\/(advertising|linkedin)(\/|$)/],
  ['microsoft', 'help.ads.microsoft.com', /^\/apex\/index\/3\/[a-z]{2}(\/|$)/],
  ['openai', 'developers.openai.com', /^\/(plugins|codex|api\/docs)(\/|$)/],
  ['anthropic', 'platform.claude.com', /^\/docs(\/|$)/]
] as const

/** Exact official host/path families only; no arbitrary network, account pages, credentials or ports. */
export function resolveOfficialDocumentationUrl(value: string): { provider: string, fetchUrl: string } {
  if (typeof value !== 'string' || value.length > 2048 || Array.from(value).some(char => char.charCodeAt(0) <= 32 || char === String.fromCharCode(92)) || /%2f|%5c|%00/i.test(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Use an approved official documentation URL' })
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid documentation URL' })
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) {
    throw createError({ statusCode: 400, statusMessage: 'Use an approved HTTPS documentation URL' })
  }
  if (url.hostname === 'github.com' || url.hostname === 'raw.githubusercontent.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    const repository = `${parts[0]}/${parts[1]}`
    const provider = REPOSITORIES[repository]
    const offset = url.hostname === 'github.com' ? 3 : 2
    const ref = parts[offset]
    const file = parts.slice(offset + 1).join('/')
    if (!provider || (url.hostname === 'github.com' && parts[2] !== 'blob')
      || !ref || !/^(main|[a-f0-9]{40})$/.test(ref) || !file || !/\.(md|txt|json)$/i.test(file)
      || url.search || file.includes('..')) {
      throw createError({ statusCode: 400, statusMessage: 'Use a text reference in an approved official repository' })
    }
    return { provider, fetchUrl: `https://raw.githubusercontent.com/${repository}/${ref}/${file}` }
  }
  const source = SOURCES.find(([, host, pattern]) => url.hostname === host && pattern.test(url.pathname))
  if (!source) throw createError({ statusCode: 400, statusMessage: 'Documentation source is not approved' })
  return { provider: source[0], fetchUrl: url.href }
}

interface HtmlNode { tagName?: string, nodeName?: string, value?: string, childNodes?: HtmlNode[] }
function extractDocument(html: string): { title: string | null, text: string } {
  const root = parse(html) as HtmlNode
  let visited = 0
  const find = (node: HtmlNode, tag: string): HtmlNode | undefined => {
    if (++visited > 50_000) return
    if (node.tagName === tag) return node
    for (const child of node.childNodes ?? []) {
      const match = find(child, tag)
      if (match) return match
    }
  }
  const collect = (node?: HtmlNode): string => {
    if (!node || ['script', 'style', 'nav', 'header', 'footer', 'noscript', 'template', 'svg', 'aside', 'form', 'button', 'input'].includes(node.tagName ?? '')) return ''
    if (node.nodeName === '#text') return node.value ?? ''
    return (node.childNodes ?? []).map(collect).join(' ')
  }
  const title = collect(find(root, 'title')).replace(/\s+/g, ' ').trim().slice(0, 240) || null
  visited = 0
  const content = find(root, 'main') ?? find(root, 'article') ?? find(root, 'body')
  return { title, text: collect(content).replace(/\s+/g, ' ').trim() }
}

/** Reference retrieval only. Never executes scripts, forwards login cookies or publishes instructions. */
export async function readOfficialDocumentation(
  requestedUrl: string,
  dependencies: { fetch?: typeof fetch, now?: () => Date, dns?: SiteIntelligenceDnsResolver } = {}
): Promise<OfficialDocumentationResult> {
  const initial = resolveOfficialDocumentationUrl(requestedUrl)
  const result: OfficialDocumentationResult = {
    provider: initial.provider, requestedUrl, url: null, title: null, status: 'unavailable',
    fetchedAt: (dependencies.now?.() ?? new Date()).toISOString(), contentDigest: null, excerpt: '', httpStatus: null
  }
  const fetcher = dependencies.fetch ?? globalThis.fetch
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const dns = dependencies.dns ?? createCloudflareDohResolver((url, options) => fetcher(url, { ...options, signal, credentials: 'omit', redirect: 'error' }))
  let current = initial.fetchUrl
  try {
    for (let hop = 0; hop <= 3; hop++) {
      let approved: ReturnType<typeof resolveOfficialDocumentationUrl>
      try {
        approved = resolveOfficialDocumentationUrl(current)
      } catch {
        return { ...result, status: 'blocked', reason: 'unapproved_redirect' }
      }
      if (approved.provider !== initial.provider) return { ...result, status: 'blocked', reason: 'cross_provider_redirect' }
      try {
        await assertPublicSiteOrigin(approved.fetchUrl, dns)
      } catch {
        return { ...result, status: 'blocked', reason: 'public_network_required' }
      }
      const response = await fetcher(approved.fetchUrl, {
        method: 'GET', redirect: 'manual', credentials: 'omit', signal,
        headers: { 'Accept': 'text/html,text/plain,application/json;q=0.8', 'User-Agent': 'XeroFlow-OfficialDocs/1.0' }
      })
      result.httpStatus = response.status
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location || hop === 3) return { ...result, reason: 'redirect_limit' }
        current = new URL(location, approved.fetchUrl).href
        continue
      }
      result.url = approved.fetchUrl
      if (!response.ok) {
        await response.body?.cancel()
        return { ...result, reason: 'http_unavailable' }
      }
      const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
      if (!['text/html', 'text/plain', 'text/markdown', 'application/json', 'application/xhtml+xml'].includes(type)) {
        await response.body?.cancel()
        return { ...result, status: 'unsupported_content', reason: 'unsupported_content_type' }
      }
      if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) {
        await response.body?.cancel()
        return { ...result, status: 'too_large', reason: 'response_byte_limit' }
      }
      const reader = response.body?.getReader()
      if (!reader) return { ...result, status: 'empty', reason: 'empty_response' }
      const chunks: Uint8Array[] = []
      let length = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > MAX_BYTES) {
          await reader.cancel()
          return { ...result, status: 'too_large', reason: 'response_byte_limit' }
        }
        chunks.push(value)
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      const body = new TextDecoder().decode(bytes)
      const doc = /html/.test(type) ? extractDocument(body) : { title: body.match(/^#\s+(.+)/m)?.[1]?.slice(0, 240) ?? null, text: body.trim() }
      result.title = doc.title
      if (/^(sign\s*in|log\s*in|just a moment|access denied|oops|page not found|404)(\b|$)|verify.*human/i.test(doc.title ?? '')
        || /no matching content|(?:do not|don't|don’t) have anything that matches your search|(?:could not|couldn't|cannot|can't) find (?:this|the|that) (?:page|content)|please (?:sign|log) in|checking your browser|enable javascript to|requires javascript|verify you are human|cloudflare ray id/i.test(doc.text.slice(0, 1500))) return { ...result, reason: 'access_or_login_required' }
      if (doc.text.length < 80) return { ...result, status: 'empty', reason: 'no_readable_document' }
      return { ...result, status: 'readable', contentDigest: createHash('sha256').update(bytes).digest('hex'), excerpt: doc.text.slice(0, MAX_TEXT) }
    }
  } catch { return { ...result, reason: signal.aborted ? 'request_timeout' : 'request_failed' } }
  return { ...result, reason: 'redirect_limit' }
}
