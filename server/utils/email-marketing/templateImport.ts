import { parse, parseFragment } from 'parse5'
import { snapshotRenderInput, validateDocumentGraph } from '../../../shared/emailRendering/bounds'
import type { EdmFlyhubDocument } from '../../../app/types/edm'

export const MAX_TEMPLATE_IMPORT_BYTES = 512 * 1024
const tags = new Set('html head body title table tbody thead tfoot tr td th caption colgroup col div span p br hr h1 h2 h3 h4 h5 h6 a img b strong i em u s small sup sub center font ul ol li blockquote pre'.split(' '))
const attrs = new Set('style id width height align valign bgcolor border cellpadding cellspacing colspan rowspan role aria-label alt title color size face target'.split(' '))
type HtmlNode = { nodeName: string, value?: string, tagName?: string, childNodes?: HtmlNode[], attrs?: { name: string, value: string, namespace?: string, prefix?: string }[] }
const cssProperties = new Set('display margin margin-top margin-bottom margin-left margin-right background color background-color font-family font-size font-weight font-style text-align text-decoration line-height letter-spacing vertical-align width max-width min-width height max-height border border-top border-bottom border-left border-right border-color border-width border-style border-radius border-collapse border-spacing padding padding-top padding-bottom padding-left padding-right'.split(' '))
function cleanStyle(style: string): string {
  if (style.length > 4096 || /url\s*\(|expression|@import|behavior|\\|[<>]/i.test(style)) return ''
  return style.split(';').map((declaration) => {
    const colon = declaration.indexOf(':')
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1).trim()
    if (property === 'display' && !['block', 'inline', 'inline-block', 'inline-table', 'table', 'table-row', 'table-cell'].includes(value.toLowerCase())) return ''
    if (property.startsWith('margin') && !/^(?:auto|(?:0|[0-9]+(?:\.[0-9]+)?(?:px|em|rem|%)?))(?:\s+(?:auto|(?:0|[0-9]+(?:\.[0-9]+)?(?:px|em|rem|%)?))){0,3}$/i.test(value)) return ''
    return colon > 0 && cssProperties.has(property) && value.length <= 200 && !/[{}@!]/.test(value) ? `${property}:${value}` : ''
  }).filter(Boolean).join(';')
}
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function safeUrl(value: string, image = false): boolean {
  if ([...value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return false
  if (!image && /^(mailto:|tel:|#)/i.test(value)) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|.*\.local$)/i.test(url.hostname) && !/^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)
  } catch { return false }
}
export function sanitizeImportedHtml(html: string): string {
  return sanitizeMarkup(html)
}
function sanitizeMarkup(html: string, fragment = false): string {
  const document = fragment ? parseFragment(html) : parse(html)
  // Serialize a parser-produced allowlist, never regex-filter HTML source.
  function clean(node: HtmlNode, depth = 0): string {
    if (depth > 100) throw new Error('HTML nesting exceeds the import limit')
    if (node.nodeName === '#text') return escape(node.value || '')
    if (node.tagName && !tags.has(node.tagName)) return ''
    const children = (node.childNodes || []).map(child => clean(child, depth + 1)).join('')
    if (!node.tagName) return children
    const attributes = (node.attrs || []).filter((a) => {
      if (a.namespace || a.prefix) return false
      if (a.name === 'href') return node.tagName === 'a' && safeUrl(a.value)
      if (a.name === 'src') return node.tagName === 'img' && safeUrl(a.value, true)
      if (a.name === 'style') return !/url\s*\(|expression|@import|behavior|\\|[<>]/i.test(a.value)
      return attrs.has(a.name)
    }).map(a => ` ${a.name}="${escape(a.name === 'style' ? cleanStyle(a.value) : a.value)}"`).join('')
    return `<${node.tagName}${attributes}>${children}${['img', 'br', 'hr', 'col'].includes(node.tagName) ? '' : `</${node.tagName}>`}`
  }
  return clean(document)
}
// Native documents are also third-party input. Their rich Text markup renders in
// the editor DOM, while links/images can live in nested collections or mobile
// overrides. Apply the same URL policy before any renderer sees those values.
function sanitizeNativeProps(value: unknown, imageBlock = false): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const child of value) sanitizeNativeProps(child)
    return
  }
  const props = value as Record<string, unknown>
  for (const [key, child] of Object.entries(props)) {
    if (/(?:url|href|src)$/i.test(key)) {
      const image = /(?:image|logo|avatar|background)(?:url|src)?$/i.test(key) || key === 'src' || (key === 'url' && imageBlock)
      props[key] = typeof child === 'string' && safeUrl(child, image) ? child : ''
    } else if (child && typeof child === 'object') sanitizeNativeProps(child)
  }
}
export function prepareTemplateImport(format: 'html' | 'json', content: string): EdmFlyhubDocument {
  if (!content.trim()) throw new Error('Choose a file or paste email content')
  if (new TextEncoder().encode(content).byteLength > MAX_TEMPLATE_IMPORT_BYTES) throw new Error('Import must be 512 KB or smaller')
  if (format === 'html') return { root: { type: 'EmailLayout', data: { childrenIds: ['imported'] } }, imported: { type: 'Html', data: { props: { contents: sanitizeImportedHtml(content) } } } }
  const document = snapshotRenderInput(JSON.parse(content), MAX_TEMPLATE_IMPORT_BYTES) as EdmFlyhubDocument
  validateDocumentGraph(document)
  // Validate disconnected blocks as well, and reject dangling references.
  for (const [id, block] of Object.entries(document)) {
    if (['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Invalid block identifier')
    const columns = block.type === 'ColumnsContainer' ? block.data.props?.columns : undefined
    const refs = [...(block.data.childrenIds || []), ...(Array.isArray(columns) ? columns.flatMap((column: { childrenIds?: string[] }) => column.childrenIds || []) : [])]
    if (refs.some(ref => !Object.hasOwn(document, ref))) throw new Error('Document contains a missing block')
    if (block.type === 'Html') {
      if (typeof block.data.props?.contents !== 'string') throw new Error('Html blocks require contents')
      block.data.props.contents = sanitizeImportedHtml(block.data.props.contents)
      const mobileContents = block.data.mobile?.props?.contents
      if (mobileContents !== undefined) {
        if (typeof mobileContents !== 'string') throw new Error('Invalid mobile Html contents')
        block.data.mobile!.props!.contents = sanitizeImportedHtml(mobileContents)
      }
    }
    for (const variant of [block.data, block.data.mobile]) {
      if (!variant) continue
      if (block.type === 'Text' && variant.props?.text !== undefined) {
        if (typeof variant.props.text !== 'string') throw new Error('Text blocks require text')
        variant.props.text = sanitizeMarkup(variant.props.text, true)
      }
      sanitizeNativeProps(variant.props, block.type === 'Image')
      if (variant.style?.backgroundImage !== undefined && variant.style.backgroundImage !== null) {
        const image = variant.style.backgroundImage
        variant.style.backgroundImage = typeof image === 'string' && safeUrl(image, true) ? image : ''
      }
    }
    // Run the graph boundary from every disconnected container too.
    if (id !== 'root') validateDocumentGraph({ ...document, root: { type: 'EmailLayout', data: { childrenIds: [id] } } })
  }
  return document
}
