import type { H3Event } from 'h3'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import { assertPublicSiteOrigin } from '~~/server/utils/siteIntelligence/urlPolicy'

type BrowserResourceKind = 'html' | 'css' | 'logo'
type Node = DefaultTreeAdapterMap['node']
interface BrowserBinding {
  quickAction: (action: 'content', options: Record<string, unknown>) => Promise<Response>
}

function textContent(node: Node): string {
  if ('value' in node) return node.value
  return 'childNodes' in node ? node.childNodes.map(textContent).join('') : ''
}

function stylesheetFromBrowserHtml(html: string): string {
  const root = parse(html)
  const visit = (node: Node): string | null => {
    if ('tagName' in node && node.tagName === 'pre') return textContent(node)
    if ('childNodes' in node) {
      for (const child of node.childNodes) {
        const found = visit(child)
        if (found !== null) return found
      }
    }
    return null
  }
  const css = visit(root)
  if (!css) throw new Error('Browser did not return stylesheet text')
  return css
}

async function boundedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) throw new Error('Browser returned an empty response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) throw new Error('Browser response exceeds the size limit')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks, length).toString('utf8')
}

/**
 * Fallback for public pages that return a Cloudflare edge 520 to Worker fetch.
 * A second public DNS check and an anchored host allowlist guard the browser.
 */
export function browserWebsiteResource(event: H3Event) {
  const binding = event.context.cloudflare?.env?.BROWSER as BrowserBinding | undefined
  if (!binding || typeof binding.quickAction !== 'function') return undefined
  return async (input: string, kind: BrowserResourceKind) => {
    const url = new URL(input)
    if (url.protocol !== 'https:') throw new Error('Browser fallback requires HTTPS')
    await assertPublicSiteOrigin(input)
    const hostPattern = url.host.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&')
    const response = await binding.quickAction('content', {
      url: input,
      allowRequestPattern: ['^https://' + hostPattern + '/'],
      rejectResourceTypes: ['image', 'font', 'media', 'script', 'xhr', 'fetch', 'websocket'],
      gotoOptions: { waitUntil: 'domcontentloaded', timeout: 10000 }
    })
    if (!response.ok) throw new Error('Browser could not read the public website')
    const payload = JSON.parse(await boundedBody(response, kind === 'css' ? 600 * 1024 : 4 * 1024 * 1024)) as { success?: boolean, result?: unknown }
    if (payload.success !== true || typeof payload.result !== 'string') throw new Error('Browser returned an invalid page')
    const content = kind === 'css' ? stylesheetFromBrowserHtml(payload.result) : payload.result
    if (kind === 'logo' && !content.trimStart().startsWith('<svg')) throw new Error('Browser could not return an original SVG logo')
    const bytes = Buffer.from(content, 'utf8')
    if (!bytes.length || bytes.length > (kind === 'css' ? 256 * 1024 : 2 * 1024 * 1024)) throw new Error('Browser resource exceeds the size limit')
    return { url: input, mimeType: kind === 'logo' ? 'image/svg+xml' : kind === 'html' ? 'text/html' : 'text/css', bytes }
  }
}
