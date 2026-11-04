import { parse } from 'parse5'
import postcss from 'postcss'

/** Bounded static delivery inspection, not a CSS layout engine or email-client
 * certification. Comments, hidden containers and common CSS hiding cannot
 * satisfy mandatory content. Never executes styles or fetches resources. */
interface Node { nodeName: string, tagName?: string, value?: string, attrs?: { name: string, value: string }[], childNodes?: Node[] }
const excluded = new Set(['head', 'style', 'script', 'noscript', 'template', 'svg', 'math', 'title'])
const hiding = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0(?:[;\s!]|$)|font-size\s*:\s*0(?:px|pt|em|rem|%|[;\s!]|$)|(?:max-)?height\s*:\s*0(?:px|pt|em|rem|%|[;\s!]|$)|color\s*:\s*transparent|clip\s*:\s*rect\(\s*0)/i
const attr = (node: Node) => Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]))
function matches(node: Node, selector: string) {
  // Only ordinary compound selectors are a proof here. Complex selectors and
  // client/media-dependent cascade are outside this static check's claim.
  if (!/^(?:[a-z][\w-]*|\*)?(?:[.#][\w-]+)*$/i.test(selector) || !selector) return false
  const a = attr(node)
  const tag = selector.match(/^[a-z][\w-]*/i)?.[0]
  if (tag && tag.toLowerCase() !== node.tagName) return false
  return [...selector.matchAll(/([.#])([\w-]+)/g)].every(([, kind, name]) => kind === '#' ? a.id === name : (a.class ?? '').split(/\s+/).includes(name!))
}
export function inspectDeliveryContent(html: string) {
  if (new TextEncoder().encode(html).length > 16 * 1024 * 1024) throw new Error('DELIVERY_INSPECTION_LIMIT')
  const document = parse(html) as Node
  const nodes: Node[] = [document]
  const hiddenSelectors: string[] = []
  let count = 0
  while (nodes.length) {
    const node = nodes.pop()!
    if (++count > 50000) throw new Error('DELIVERY_INSPECTION_LIMIT')
    if (node.tagName === 'style') {
      const css = (node.childNodes ?? []).map(n => n.value ?? '').join('')
      if (css.length > 256 * 1024) throw new Error('DELIVERY_INSPECTION_LIMIT')
      try {
        postcss.parse(css).walkRules((rule) => {
          if (rule.parent?.type !== 'root') return
          if (hiding.test(rule.nodes.map(n => n.toString()).join(';'))) hiddenSelectors.push(...rule.selector.split(',').map(s => s.trim()))
          if (hiddenSelectors.length > 2000) throw new Error('DELIVERY_INSPECTION_LIMIT')
        })
      } catch { throw new Error('DELIVERY_STYLE_UNVERIFIABLE') }
    }
    nodes.push(...node.childNodes ?? [])
  }
  const links: { href: string, text: string }[] = []
  const textParts: string[] = []
  const walk = (node: Node, depth: number): string => {
    if (depth > 100) throw new Error('DELIVERY_INSPECTION_LIMIT')
    const a = attr(node)
    if (node.nodeName === '#comment' || (node.tagName && excluded.has(node.tagName)) || Object.hasOwn(a, 'hidden') || a['aria-hidden'] === 'true' || hiding.test(a.style ?? '') || hiddenSelectors.some(s => matches(node, s))) return ''
    if (node.nodeName === '#text') return node.value ?? ''
    const value = (node.childNodes ?? []).map(n => walk(n, depth + 1)).join(' ')
    if (node.tagName === 'a' && a.href && value.trim()) links.push({ href: a.href, text: value.trim() })
    return value
  }
  textParts.push(walk(document, 0))
  return { text: textParts.join(' ').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim(), links }
}
export function isUsableUnsubscribeHref(href: string, allowToken = false): boolean {
  if (allowToken && /^\{\{\s*unsubscribe_url\s*\}\}$/i.test(href.trim())) return true
  if (/[{}]/.test(href) || [...href].some(char => char.charCodeAt(0) <= 32)) return false
  try {
    const url = new URL(href)
    // A label/query parameter alone is a decoy, not an unsubscribe endpoint.
    return url.protocol === 'https:' && !url.username && !url.password && /(?:^|[/_-])unsubscribe(?:$|[/_.-])/i.test(url.pathname)
  } catch { return false }
}

export function deliveryHasUnsubscribe(html: string, allowToken = false): boolean {
  try {
    return inspectDeliveryContent(html).links.some(link => isUsableUnsubscribeHref(link.href, allowToken))
  } catch { return false }
}

export function deliveryPlainText(input: string | ReturnType<typeof inspectDeliveryContent>): string {
  const visible = typeof input === 'string' ? inspectDeliveryContent(input) : input
  return [visible.text, ...visible.links.map(link => `${link.text}: ${link.href}`)].join('\n\n')
}
