// app/utils/edmInlineText.ts
// Helpers for inline (on-canvas) text editing — Phase 3b WYSIWYG.
//
// Text blocks render their stored value with v-html (raw HTML, by design — the
// server renderer also emits it unescaped), so when a user edits a Text block
// in place via contenteditable, the captured innerHTML MUST be sanitised before
// it is stored, or a paste/keystroke could inject arbitrary markup that ends up
// in the sent email. We sanitise with the real DOM parser (browser / happy-dom)
// rather than regex — only a small whitelist of inline formatting tags survives,
// every attribute is stripped except a validated href on <a>.

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'A', 'BR', 'SPAN'])
// Matches a non-breaking space as the raw char (real browsers serialise it so)
// or as the &nbsp; entity (happy-dom / some browsers serialise it that way).
const NBSP = /\u00A0|&nbsp;/g

function isSafeHref(href: string): boolean {
  const v = href.trim()
  return /^(https?:\/\/|mailto:)/i.test(v) && !/["'<>]/.test(v)
}

// Recursively produce sanitised clones of a node's allowed content.
function cleanNode(node: Node, doc: Document): Node[] {
  // Text node → keep (its data is inserted as text, so it's inert)
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return [doc.createTextNode(node.nodeValue || '')]
  }
  // Anything that isn't an element (comments, etc.) → drop
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return []

  const el = node as Element
  const tag = el.tagName.toUpperCase()
  const cleanedChildren = Array.from(el.childNodes).flatMap(c => cleanNode(c, doc))

  // Disallowed tag → unwrap (keep its sanitised children, drop the tag itself)
  if (!ALLOWED_TAGS.has(tag)) return cleanedChildren

  const out = doc.createElement(tag.toLowerCase())
  if (tag === 'A') {
    const href = el.getAttribute('href') || ''
    if (isSafeHref(href)) {
      out.setAttribute('href', href.trim())
      out.setAttribute('target', '_blank')
      out.setAttribute('rel', 'noopener noreferrer')
    }
  }
  cleanedChildren.forEach(c => out.appendChild(c))
  return [out]
}

/**
 * Sanitise contenteditable HTML to a safe inline subset (b/strong/i/em/u/a/br/
 * span; href only on <a>, http(s)/mailto only). Returns plain stripped text when
 * no DOM is available (SSR) — inline editing is client-only so this is a guard.
 */
export function sanitizeInlineHtml(html: string): string {
  if (!html) return ''
  if (typeof document === 'undefined') {
    // SSR fallback: strip tags entirely (no parser available).
    return html.replace(/<[^>]*>/g, '')
  }
  const container = document.createElement('div')
  container.innerHTML = html
  const cleaned = Array.from(container.childNodes).flatMap(c => cleanNode(c, document))
  const out = document.createElement('div')
  cleaned.forEach(c => out.appendChild(c))
  // Normalise the &nbsp; that contenteditable injects for spacing.
  return out.innerHTML.replace(NBSP, ' ').trim()
}

/**
 * Plain-text extraction for blocks rendered as escaped text (Heading, Button).
 * Collapses contenteditable's &nbsp; and surrounding whitespace.
 */
export function extractPlainText(value: string): string {
  return (value || '').replace(NBSP, ' ').replace(/\s+/g, ' ').trim()
}
