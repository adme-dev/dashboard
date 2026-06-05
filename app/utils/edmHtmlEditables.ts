import { extractPlainText, sanitizeInlineHtml } from './edmInlineText'

export type EdmHtmlEditableKind = 'text' | 'link' | 'image'

export interface EdmHtmlEditablePadding {
  top?: number
  bottom?: number
  left?: number
  right?: number
}

export interface EdmHtmlEditableSelection {
  blockId?: string
  id: string
  kind: EdmHtmlEditableKind
  label: string
  text?: string
  html?: string
  href?: string
  src?: string
  alt?: string
  linkHref?: string
  imageMode?: 'inline' | 'background'
  style?: {
    color?: string
    fontFamily?: string
    fontSize?: string
    fontWeight?: string
    textAlign?: string
    padding?: EdmHtmlEditablePadding
  }
}

export type EdmHtmlEditableUpdate =
  | { kind: 'text', text?: string, html?: string, color?: string, fontFamily?: string, fontSize?: string, fontWeight?: string, textAlign?: string, padding?: EdmHtmlEditablePadding }
  | { kind: 'link', text?: string, html?: string, href?: string, color?: string, fontFamily?: string, fontSize?: string, fontWeight?: string, textAlign?: string, padding?: EdmHtmlEditablePadding }
  | { kind: 'image', src?: string, alt?: string, linkHref?: string, padding?: EdmHtmlEditablePadding }

const SKIP_TAGS = new Set([
  'STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'TITLE',
  'META', 'LINK', 'HEAD', 'SVG', 'MATH'
])

function canUseDom(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function'
}

function parseHtml(html: string): HTMLElement | null {
  if (!canUseDom()) return null
  const root = document.createElement('div')
  root.innerHTML = html || ''
  return root
}

function normaliseText(value: string | null | undefined): string {
  return extractPlainText(value || '')
}

function elementPath(el: Element, root: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  while (cur && cur !== root) {
    const parent = cur.parentElement
    if (!parent) break
    const siblings = Array.from(parent.children).filter(child => child.tagName === cur?.tagName)
    parts.unshift(`${cur.tagName.toLowerCase()}[${siblings.indexOf(cur)}]`)
    cur = parent
  }
  return parts.join('/')
}

function findByPath(root: Element, path: string): Element | null {
  let cur: Element | null = root
  for (const part of path.split('/').filter(Boolean)) {
    const match = /^([a-z0-9-]+)\[(\d+)\]$/i.exec(part)
    if (!match || !cur) return null
    const [, tag, indexRaw] = match
    const index = Number(indexRaw)
    const candidates = Array.from(cur.children).filter(child => child.tagName.toLowerCase() === tag.toLowerCase())
    cur = candidates[index] || null
  }
  return cur
}

function editableId(kind: EdmHtmlEditableKind, el: Element, root: Element): string {
  return `${kind}:${elementPath(el, root)}`
}

function splitEditableId(id: string): { kind: EdmHtmlEditableKind, path: string } | null {
  const index = id.indexOf(':')
  if (index <= 0) return null
  const kind = id.slice(0, index) as EdmHtmlEditableKind
  if (!['text', 'link', 'image'].includes(kind)) return null
  return { kind, path: id.slice(index + 1) }
}

function directText(el: Element): string {
  return Array.from(el.childNodes)
    .filter(node => node.nodeType === 3)
    .map(node => node.nodeValue || '')
    .join('')
}

function hasMeaningfulDirectText(el: Element): boolean {
  return normaliseText(directText(el)).length >= 2
}

function hasElementChildrenOtherThanBr(el: Element): boolean {
  return Array.from(el.children).some(child => child.tagName !== 'BR')
}

function getElementStyle(el: Element): EdmHtmlEditableSelection['style'] {
  const style = (el as HTMLElement).style
  return {
    color: style.color || undefined,
    fontFamily: style.fontFamily || undefined,
    fontSize: style.fontSize || undefined,
    fontWeight: style.fontWeight || undefined,
    textAlign: style.textAlign || undefined
  }
}

function cssPixelNumber(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined
}

function readPadding(el: Element): EdmHtmlEditablePadding {
  const style = (el as HTMLElement).style
  return {
    top: cssPixelNumber(style.paddingTop),
    bottom: cssPixelNumber(style.paddingBottom),
    left: cssPixelNumber(style.paddingLeft),
    right: cssPixelNumber(style.paddingRight)
  }
}

function paddingReadTargets(target: Element): Element[] {
  if (target.tagName !== 'TR') return [target]
  const cells = Array.from(target.children).filter(child => child.tagName === 'TD' || child.tagName === 'TH')
  return cells.length > 0 ? cells : [target]
}

function getEditableItemPadding(el: Element, root: Element): EdmHtmlEditablePadding | undefined {
  const target = editableItemTargetForElement(el, root)
  const [readTarget] = paddingReadTargets(target)
  if (!readTarget) return undefined
  const padding = readPadding(readTarget)
  return Object.values(padding).some(value => value !== undefined) ? padding : undefined
}

function cssUrlValue(value: string | null | undefined): string {
  const match = /url\(\s*(['"]?)(.*?)\1\s*\)/i.exec(value || '')
  return match?.[2] || ''
}

function backgroundImageSrc(el: Element): string {
  const explicit = el.getAttribute('background') || ''
  if (explicit) return explicit
  const style = el as HTMLElement
  return cssUrlValue(style.style.backgroundImage)
}

function hasEditableBackgroundImage(el: Element): boolean {
  return el.tagName !== 'IMG' && Boolean(backgroundImageSrc(el))
}

function imageSrc(el: Element): string {
  if (el.tagName === 'IMG') return el.getAttribute('src') || ''
  return backgroundImageSrc(el)
}

function imageMode(el: Element): 'inline' | 'background' {
  return el.tagName === 'IMG' ? 'inline' : 'background'
}

function selectionFromElement(
  el: Element,
  root: Element,
  kind: EdmHtmlEditableKind
): EdmHtmlEditableSelection | null {
  const id = editableId(kind, el, root)
  if (kind === 'image') {
    const mode = imageMode(el)
    const closestLink = el.closest('a[href]')
    return {
      id,
      kind,
      label: mode === 'background' ? 'Background image' : 'Image',
      src: imageSrc(el),
      alt: el.getAttribute('alt') || '',
      imageMode: mode,
      linkHref: closestLink?.getAttribute('href') || '',
      style: {
        padding: getEditableItemPadding(el, root)
      }
    }
  }
  if (kind === 'link') {
    const link = el as HTMLAnchorElement
    return {
      id,
      kind,
      label: 'Link',
      text: normaliseText(link.textContent),
      html: link.innerHTML,
      href: link.getAttribute('href') || '',
      style: {
        ...getElementStyle(link),
        padding: getEditableItemPadding(link, root)
      }
    }
  }
  return {
    id,
    kind,
    label: 'Text',
    text: normaliseText(el.textContent),
    html: (el as HTMLElement).innerHTML,
    style: {
      ...getElementStyle(el),
      padding: getEditableItemPadding(el, root)
    }
  }
}

function collectEditables(root: Element): EdmHtmlEditableSelection[] {
  const out: EdmHtmlEditableSelection[] = []

  function walk(el: Element) {
    if (SKIP_TAGS.has(el.tagName)) return

    const hasBackgroundImage = hasEditableBackgroundImage(el)
    if (hasBackgroundImage) {
      const selection = selectionFromElement(el, root, 'image')
      if (selection) out.push(selection)
    }

    if (el.tagName === 'IMG' && el.getAttribute('src')) {
      const selection = selectionFromElement(el, root, 'image')
      if (selection) out.push(selection)
      return
    }

    if (el.tagName === 'A' && normaliseText(el.textContent).length >= 1) {
      const selection = selectionFromElement(el, root, 'link')
      if (selection) out.push(selection)
      return
    }

    if (!hasBackgroundImage && hasMeaningfulDirectText(el) && !hasElementChildrenOtherThanBr(el)) {
      const selection = selectionFromElement(el, root, 'text')
      if (selection) out.push(selection)
      return
    }

    Array.from(el.children).forEach(child => walk(child))
  }

  Array.from(root.children).forEach(child => walk(child))
  return out
}

function findSelectionElement(root: Element, id: string): { el: Element, kind: EdmHtmlEditableKind } | null {
  const parsed = splitEditableId(id)
  if (!parsed) return null
  const el = findByPath(root, parsed.path)
  if (!el) return null
  return { el, kind: parsed.kind }
}

function sameTagSiblingCount(el: Element): number {
  const parent = el.parentElement
  if (!parent) return 0
  return Array.from(parent.children).filter(child => child.tagName === el.tagName).length
}

function editableItemTargetForElement(el: Element, root: Element): Element {
  let cur: Element | null = el
  while (cur && cur !== root) {
    if ((cur.tagName === 'TR' || cur.tagName === 'LI') && sameTagSiblingCount(cur) > 1) return cur
    cur = cur.parentElement
  }

  cur = el
  while (cur && cur !== root) {
    if ((cur.tagName === 'P' || cur.tagName === 'DIV') && sameTagSiblingCount(cur) > 1) return cur
    cur = cur.parentElement
  }

  return el
}

function isSafeEditableHref(value: string): boolean {
  const href = value.trim()
  if (href === '' || href === '#') return true
  if (/["'`<>]/.test(href) || /\s/.test(href)) return false
  return /^(https?:\/\/|mailto:|\/|\.\/|\.\.\/|#)/i.test(href)
}

function safeEditableHref(value: string): string {
  const href = value.trim()
  return isSafeEditableHref(href) ? href : ''
}

function safeImageSrc(value: string): string {
  const src = value.trim()
  if (!src || /["'`<>]/.test(src) || /\s/.test(src)) return ''
  if (/^javascript:/i.test(src)) return ''
  if (/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(src)) return src
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(src)) return src
  return ''
}

function safeFontFamily(value: string): string {
  const fontFamily = value.trim()
  if (!fontFamily || fontFamily.length > 180) return ''
  return /^[a-z0-9\s"',._-]+$/i.test(fontFamily) ? fontFamily : ''
}

function cssUrl(src: string): string {
  return `url('${src.replace(/'/g, '%27')}')`
}

function updateImageSrc(el: Element, src: string) {
  if (el.tagName === 'IMG') {
    el.setAttribute('src', src)
    return
  }

  if (el.hasAttribute('background') || ['TD', 'TH', 'TABLE'].includes(el.tagName)) {
    el.setAttribute('background', src)
  }
  ;(el as HTMLElement).style.backgroundImage = cssUrl(src)
}

function safePaddingPx(value: number | undefined): string | null {
  if (value === undefined) return null
  if (!Number.isFinite(value)) return null
  return `${Math.max(0, Math.min(240, Math.round(value)))}px`
}

function applyItemPadding(el: Element, root: Element, padding: EdmHtmlEditablePadding | undefined) {
  if (!padding) return
  const target = editableItemTargetForElement(el, root)
  for (const padTarget of paddingReadTargets(target)) {
    const style = (padTarget as HTMLElement).style
    const top = safePaddingPx(padding.top)
    const bottom = safePaddingPx(padding.bottom)
    const left = safePaddingPx(padding.left)
    const right = safePaddingPx(padding.right)
    if (top !== null) style.paddingTop = top
    if (bottom !== null) style.paddingBottom = bottom
    if (left !== null) style.paddingLeft = left
    if (right !== null) style.paddingRight = right
  }
}

function stripEditorAttributes(root: Element) {
  for (const el of Array.from(root.querySelectorAll('[data-edm-html-editable-id]'))) {
    el.removeAttribute('data-edm-html-editable-id')
    el.removeAttribute('data-edm-html-editable-kind')
    el.removeAttribute('contenteditable')
    el.removeAttribute('role')
    el.removeAttribute('tabindex')
    el.removeAttribute('aria-label')
    el.removeAttribute('data-edm-html-editable-mode')
    el.classList.remove('edm-html-editable', 'is-selected')
    if (!el.getAttribute('class')) el.removeAttribute('class')
  }
}

function serialise(root: Element): string {
  stripEditorAttributes(root)
  return root.innerHTML
}

export function annotateHtmlEditables(
  html: string,
  options: { editable?: boolean, selectedId?: string | null } = {}
): string {
  if (!options.editable) return html || ''
  const root = parseHtml(html)
  if (!root) return html || ''

  for (const selection of collectEditables(root)) {
    const found = findSelectionElement(root, selection.id)
    if (!found) continue
    const el = found.el as HTMLElement
    el.dataset.edmHtmlEditableId = selection.id
    el.dataset.edmHtmlEditableKind = selection.kind
    if (selection.imageMode) el.dataset.edmHtmlEditableMode = selection.imageMode
    el.classList.add('edm-html-editable')
    if (selection.id === options.selectedId) el.classList.add('is-selected')
    if (selection.kind === 'text' || selection.kind === 'link') {
      el.setAttribute('contenteditable', 'true')
      el.setAttribute('role', 'textbox')
      el.setAttribute('aria-label', selection.kind === 'link' ? 'Edit link text' : 'Edit text')
    } else {
      el.setAttribute('tabindex', '0')
      el.setAttribute('role', 'button')
      el.setAttribute('aria-label', 'Edit image')
    }
  }

  return root.innerHTML
}

export function getHtmlEditableSelection(html: string, id: string): EdmHtmlEditableSelection | null {
  const root = parseHtml(html)
  if (!root) return null
  const found = findSelectionElement(root, id)
  if (!found) return null
  return selectionFromElement(found.el, root, found.kind)
}

export function duplicateHtmlEditable(
  html: string,
  id: string
): { contents: string, selection: EdmHtmlEditableSelection | null } {
  const root = parseHtml(html)
  if (!root) return { contents: html || '', selection: null }
  const found = findSelectionElement(root, id)
  if (!found) return { contents: html || '', selection: null }

  const target = editableItemTargetForElement(found.el, root)
  const relativeSelectionPath = target === found.el ? '' : elementPath(found.el, target)
  const clone = target.cloneNode(true) as Element
  target.parentElement?.insertBefore(clone, target.nextSibling)

  const clonedSelectionEl = relativeSelectionPath ? findByPath(clone, relativeSelectionPath) : clone
  const selection = clonedSelectionEl
    ? selectionFromElement(clonedSelectionEl, root, found.kind)
    : null

  return {
    contents: serialise(root),
    selection
  }
}

export function deleteHtmlEditable(
  html: string,
  id: string
): { contents: string, selection: EdmHtmlEditableSelection | null } {
  const root = parseHtml(html)
  if (!root) return { contents: html || '', selection: null }
  const found = findSelectionElement(root, id)
  if (!found) return { contents: html || '', selection: null }

  const target = editableItemTargetForElement(found.el, root)
  target.parentElement?.removeChild(target)

  return {
    contents: serialise(root),
    selection: null
  }
}

export function updateHtmlEditable(
  html: string,
  id: string,
  update: EdmHtmlEditableUpdate
): string {
  const root = parseHtml(html)
  if (!root) return html || ''
  const found = findSelectionElement(root, id)
  if (!found || found.kind !== update.kind) return html || ''

  const { el } = found
  if (update.kind === 'text') {
    if (typeof update.html === 'string') {
      ;(el as HTMLElement).innerHTML = sanitizeInlineHtml(update.html)
    } else if (typeof update.text === 'string') {
      el.textContent = update.text
    }
    if (update.color !== undefined) (el as HTMLElement).style.color = update.color
    if (update.fontFamily !== undefined) {
      const fontFamily = safeFontFamily(update.fontFamily)
      if (fontFamily) (el as HTMLElement).style.fontFamily = fontFamily
    }
    if (update.fontSize !== undefined) (el as HTMLElement).style.fontSize = update.fontSize
    if (update.fontWeight !== undefined) (el as HTMLElement).style.fontWeight = update.fontWeight
    if (update.textAlign !== undefined) (el as HTMLElement).style.textAlign = update.textAlign
    applyItemPadding(el, root, update.padding)
  }

  if (update.kind === 'link') {
    const link = el as HTMLAnchorElement
    if (typeof update.html === 'string') {
      link.innerHTML = sanitizeInlineHtml(update.html)
    } else if (typeof update.text === 'string') {
      link.textContent = update.text
    }
    if (update.href !== undefined) {
      const href = safeEditableHref(update.href)
      if (href) link.setAttribute('href', href)
    }
    if (update.color !== undefined) link.style.color = update.color
    if (update.fontFamily !== undefined) {
      const fontFamily = safeFontFamily(update.fontFamily)
      if (fontFamily) link.style.fontFamily = fontFamily
    }
    if (update.fontSize !== undefined) link.style.fontSize = update.fontSize
    if (update.fontWeight !== undefined) link.style.fontWeight = update.fontWeight
    if (update.textAlign !== undefined) link.style.textAlign = update.textAlign
    applyItemPadding(link, root, update.padding)
  }

  if (update.kind === 'image') {
    let replacedBackgroundSrc: { from: string, to: string } | null = null
    if (update.src !== undefined) {
      const src = safeImageSrc(update.src)
      if (src) {
        const from = imageSrc(el)
        updateImageSrc(el, src)
        if (imageMode(el) === 'background' && from && from !== src) replacedBackgroundSrc = { from, to: src }
      }
    }
    if (update.alt !== undefined) el.setAttribute('alt', update.alt)
    if (update.linkHref !== undefined) {
      const href = safeEditableHref(update.linkHref)
      let link = el.closest('a')
      if (href) {
        if (!link) {
          link = document.createElement('a')
          el.replaceWith(link)
          link.appendChild(el)
        }
        link.setAttribute('href', href)
      } else if (link) {
        link.replaceWith(el)
      }
    }
    applyItemPadding(el, root, update.padding)

    const next = serialise(root)
    return replacedBackgroundSrc
      ? next.split(replacedBackgroundSrc.from).join(replacedBackgroundSrc.to)
      : next
  }

  return serialise(root)
}
