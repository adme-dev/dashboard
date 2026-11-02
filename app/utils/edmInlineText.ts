import { isAuthorableMergeToken } from '~~/shared/emailRendering/mergeTagDefinitions'
import { sanitizeEmailCanvasHtml } from './edmCanvasHtml'

// app/utils/edmInlineText.ts
// Helpers for inline (on-canvas) text editing — Phase 3b WYSIWYG.
//
// Text blocks render their stored value with v-html (raw HTML, by design — the
// server renderer also emits it unescaped), so when a user edits a Text block
// in place via contenteditable, the captured innerHTML MUST be sanitised before
// it is stored, or a paste/keystroke could inject arbitrary markup that ends up
// in the sent email. We sanitise with the real DOM parser (browser / happy-dom)
// rather than regex — only a small whitelist of inline formatting tags survives,
// every attribute is stripped except a validated href on <a> and a validated
// canonical data-merge token on <span>.

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'A', 'BR', 'SPAN'])
// Tags whose entire subtree is dropped (not unwrapped). Covers raw-text /
// metadata / foreign-content elements: in a real (spec-compliant) browser these
// parse into namespaced or raw-text subtrees where unwrapping could leak markup
// or treat an SVG <a> as an HTML anchor. Dropping them wholesale is the safe
// default; happy-dom is lenient here but prod browsers are not.
const DROP_SUBTREE_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'TITLE',
  'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH'
])
// Matches a non-breaking space as the raw char (real browsers serialise it so)
// or as the &nbsp; entity (happy-dom / some browsers serialise it that way).
const NBSP = /\u00A0|&nbsp;/g

function isSafeHref(href: string): boolean {
  const v = href.trim()
  // http(s)/mailto only, and reject any char that could break out of the
  // attribute or smuggle a handler: quotes, angle brackets, backtick, and any
  // whitespace/control char.
  return /^(https?:\/\/|mailto:)/i.test(v) && !/["'`<>]/.test(v) && !/\s/.test(v)
}

export function safeInlineHref(href: string): string {
  const value = href.trim()
  return isSafeHref(value) ? value : ''
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

  // Dangerous / foreign-content / raw-text tags → drop the WHOLE subtree before
  // recursing (don't leak their contents as text, don't treat foreign <a> as an
  // HTML anchor).
  if (DROP_SUBTREE_TAGS.has(tag)) return []

  // A merge chip's identity is the validated canonical token, never its label or
  // arbitrary pasted attributes. Editor-only contenteditable/classes are rebuilt.
  const merge = tag === 'SPAN' ? el.getAttribute('data-merge') : null
  if (merge && isAuthorableMergeToken(merge)) {
    const chip = doc.createElement('span')
    chip.setAttribute('data-merge', merge)
    chip.textContent = merge
    return [chip]
  }

  const cleanedChildren = Array.from(el.childNodes).flatMap(c => cleanNode(c, doc))

  // Other disallowed tags → unwrap (keep sanitised children, drop the tag).
  if (!ALLOWED_TAGS.has(tag)) return cleanedChildren

  const out = doc.createElement(tag.toLowerCase())
  if (tag === 'A') {
    const href = safeInlineHref(el.getAttribute('href') || '')
    if (href) {
      out.setAttribute('href', href)
      out.setAttribute('target', '_blank')
      out.setAttribute('rel', 'noopener noreferrer')
    }
  }
  cleanedChildren.forEach(c => out.appendChild(c))
  return [out]
}

/**
 * Sanitise contenteditable HTML to a safe inline subset (b/strong/i/em/u/a/br/
 * span; validated href on <a>, canonical data-merge only on <span>). Returns plain stripped text when
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

/** Serialize editing chips back to durable tokens; editor metadata never sends. */
export function serializeInlineMergeHtml(html: string): string {
  const safe = sanitizeInlineHtml(html)
  if (typeof document === 'undefined') return safe
  const root = document.createElement('div')
  root.innerHTML = safe
  for (const chip of root.querySelectorAll('span[data-merge]')) {
    chip.replaceWith(document.createTextNode(chip.getAttribute('data-merge')!))
  }
  return root.innerHTML.replace(NBSP, ' ').trim()
}

/** Hydrate text nodes only. Attributes and HTML markup can never become chips. */
export function inlineMergeEditorHtml(html: string): string {
  if (typeof document === 'undefined') return sanitizeInlineHtml(html)
  const root = document.createElement('div')
  // Keep existing safe presentation on initial display, matching the canvas.
  // The existing strict inline sanitizer still governs every edit commit.
  root.innerHTML = sanitizeEmailCanvasHtml(html, false)
  for (const element of root.querySelectorAll('[contenteditable]')) element.removeAttribute('contenteditable')
  for (const chip of root.querySelectorAll('[data-merge]')) {
    const token = chip.getAttribute('data-merge')!
    if (chip.tagName === 'SPAN' && isAuthorableMergeToken(token)) chip.replaceWith(document.createTextNode(token))
    else chip.removeAttribute('data-merge')
  }
  const walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    const parts = document.createDocumentFragment()
    let cursor = 0
    for (const match of node.data.matchAll(/\{\{[^{}]{1,380}\}\}/g)) {
      if (!isAuthorableMergeToken(match[0])) continue
      parts.appendChild(document.createTextNode(node.data.slice(cursor, match.index)))
      const chip = document.createElement('span')
      chip.setAttribute('data-merge', match[0])
      chip.setAttribute('contenteditable', 'false')
      chip.textContent = match[0]
      parts.appendChild(chip)
      cursor = match.index! + match[0].length
    }
    if (!cursor) continue
    parts.appendChild(document.createTextNode(node.data.slice(cursor)))
    node.replaceWith(parts)
  }
  return root.innerHTML
}

export type InlineSelectionOffsets = { start: number, end: number }
export function inlineSelectionOffsets(root: HTMLElement): InlineSelectionOffsets | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const before = range.cloneRange()
  before.selectNodeContents(root)
  before.setEnd(range.startContainer, range.startOffset)
  return { start: before.toString().length, end: before.toString().length + range.toString().length }
}

/** Restore a logical selection without ever placing a caret inside a chip. */
export function restoreInlineSelection(root: HTMLElement, offsets: InlineSelectionOffsets): Range {
  const range = document.createRange()
  const position = (offset: number, end: boolean): { node: Node, offset: number } => {
    const walker = document.createTreeWalker(root, 4)
    let remaining = offset
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      if (remaining <= node.length) {
        const chip = node.parentElement?.closest('[data-merge]')
        if (chip && root.contains(chip)) {
          const index = Array.from(chip.parentNode!.childNodes).indexOf(chip)
          return { node: chip.parentNode!, offset: index + (end || remaining > 0 ? 1 : 0) }
        }
        return { node, offset: remaining }
      }
      remaining -= node.length
    }
    return { node: root, offset: root.childNodes.length }
  }
  const start = position(offsets.start, false)
  const end = position(offsets.end, offsets.end !== offsets.start)
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return range
}

/** Selection bookmarks survive the blur/commit re-render when opening a picker. */
export function insertInlineMergeToken(root: HTMLElement, token: string, offsets: InlineSelectionOffsets | null): void {
  if (!isAuthorableMergeToken(token)) return
  const end = root.textContent?.length || 0
  const range = restoreInlineSelection(root, offsets ?? { start: end, end })
  range.deleteContents()
  const node = document.createTextNode(token)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
