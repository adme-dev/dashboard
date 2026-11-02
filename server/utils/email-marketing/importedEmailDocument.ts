/* eslint no-control-regex: off -- Explicit URL control-byte rejection. */
import { parse, parseFragment } from 'parse5'
import postcss from 'postcss'
import { publicEmailUrl } from '../../../shared/emailRendering/importedDocument'

// Full documents live only in an isolated editor frame and the compiled email.
// The conservative fragment importer keeps its existing policy unchanged.
const htmlTags = new Set('html head body title style meta link table tbody thead tfoot tr td th caption colgroup col div span p br hr h1 h2 h3 h4 h5 h6 a img b strong i em u s small sup sub center font ul ol li blockquote pre figure figcaption'.split(' '))
const officeTags = new Set('xml noscript o:officedocumentsettings o:allowpng o:pixelsperinch w:worddocument w:dontuseadvancedtypographyreadingmail v:roundrect v:rect v:fill v:stroke v:textbox w:anchorlock'.split(' '))
const attributes = new Set('class id lang dir role aria-label aria-hidden style width height align valign bgcolor border cellpadding cellspacing colspan rowspan alt title color size face target rel background'.split(' '))
const officeAttributes = new Set('arcsize fillcolor strokecolor strokeweight dashstyle weight type inset v-text-anchor'.split(' '))
const cssProperties = new Set('display visibility overflow overflow-x overflow-y opacity margin margin-top margin-bottom margin-left margin-right background background-image background-color background-position background-size background-repeat color font-family font-size font-weight font-style font-display font-smoothing text-align text-decoration text-decoration-color text-transform text-size-adjust line-height letter-spacing word-spacing word-break word-wrap overflow-wrap white-space vertical-align width max-width min-width height min-height max-height box-sizing border border-top border-bottom border-left border-right border-color border-width border-style border-radius border-collapse border-spacing padding padding-top padding-bottom padding-left padding-right float clear position transform transition mix-blend-mode content src v-text-anchor'.split(' '))
type Node = { nodeName: string, value?: string, data?: string, tagName?: string, childNodes?: Node[], attrs?: { name: string, value: string, namespace?: string, prefix?: string }[] }
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function cssValue(value: string): boolean {
  if (value.length > 4096 || /[<>\\]|expression\s*\(|(?:java|vb)script\s*:|@import|behavior|-moz-binding/i.test(value)) return false
  let valid = true
  const remaining = value.replace(/url\(\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s)'"\r\n]+))\s*\)/gi, (_match, double, single, bare) => {
    if (!publicEmailUrl(double ?? single ?? bare)) valid = false
    return ''
  })
  return valid && !/url\s*\(|(?:https?|data|blob|ftp)\s*:/i.test(remaining)
}

export function sanitizeEmailCss(css: string, inline = false): string {
  if (css.length > 256 * 1024 || /</.test(css)) return ''
  let tree: ReturnType<typeof postcss.parse>
  try {
    tree = postcss.parse(inline ? `email{${css}}` : css, { from: undefined })
  } catch {
    return ''
  }
  let count = 0
  tree.walk((node) => {
    if (++count > 12000) throw new Error('Email stylesheet exceeds the import limit')
    let depth = 0
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (++depth > 16) throw new Error('Email stylesheet nesting exceeds the import limit')
    }
    if (node.type === 'comment') node.remove()
    if (node.type === 'atrule') {
      if (inline || !['media', 'font-face', 'supports'].includes(node.name.toLowerCase()) || node.params.length > 1024 || /[<>@\\]/.test(node.params) || !node.nodes) node.remove()
    }
    if (node.type === 'rule' && (node.selector.length > 4096 || /[<@\\]/.test(node.selector))) node.remove()
    if (node.type === 'decl') {
      const property = node.prop.toLowerCase()
      const plain = property.replace(/^-(?:webkit|ms|moz)-/, '')
      if ((!cssProperties.has(plain) && !/^mso-[a-z-]+$/.test(property)) || !cssValue(node.value)
        || (plain === 'position' && !['static', 'relative'].includes(node.value.toLowerCase()))) node.remove()
    }
  })
  // Do not let untrusted PostCSS raw formatting smuggle a comment/tag boundary.
  tree.walk(node => node.cleanRaws())
  return inline ? (tree.first && 'nodes' in tree.first ? tree.first.nodes?.map(node => node.toString()).join(';') || '' : '') : tree.toString()
}

function cleanAttributes(tag: string, attrs: NonNullable<Node['attrs']>, office = false): string {
  return attrs.flatMap((attr) => {
    const name = attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name
    const value = attr.value
    if (/^on/i.test(name)) return []
    if (name === 'xmlns' || name.startsWith('xmlns:')) return /^(?:http:\/\/www.w3.org\/1999\/xhtml|urn:schemas-microsoft-com:(?:vml|office:office|office:word))$/.test(value) ? [` ${name}="${escape(value)}"`] : []
    if (attr.namespace || attr.prefix) return []
    if (name === 'href' && (tag === 'a' || (office && ['v:roundrect', 'v:rect'].includes(tag)))) return publicEmailUrl(value, true) ? [` href="${escape(value)}"`] : []
    if ((name === 'src' && (tag === 'img' || (office && tag === 'v:fill'))) || name === 'background') return publicEmailUrl(value) ? [` ${name}="${escape(value)}"`] : []
    if (name === 'style') {
      const css = sanitizeEmailCss(value, true)
      return css ? [` style="${escape(css)}"`] : []
    }
    if (attributes.has(name) || (office && officeAttributes.has(name))) return [` ${name}="${escape(value)}"`]
    return []
  }).join('')
}

/** Conditional fragments can deliberately open/close a table or VML shape in
 * separate comments. Sanitize each token without parser auto-closing its tags. */
function conditional(value: string): string {
  const marker = value.trim()
  if (/^\[if\s+!mso\s*\]>\s*<!(?:--\s*)?$/i.test(marker) || /^<!\[endif\]$/i.test(marker)) return `<!--${value}-->`
  const match = /^\[if\s+([A-Za-z0-9\s!()|<>=.&-]{1,100})\]>([\s\S]*)<!\[endif\]\s*$/i.exec(marker)
  if (!match || /--/.test(match[1]) || /<!--|-->|<\s*(?:script|iframe|object|embed|form|input|base|link)\b/i.test(match[2])) return ''
  let body = match[2].replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_whole, css: string) => `<style>${sanitizeEmailCss(css)}</style>`)
  let valid = true
  body = body.replace(/<(\/?)([A-Za-z][\w:-]*)((?:[^"'<>]|"[^"<>]*"|'[^'<>]*')*)>/g, (_whole, close: string, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase()
    if (!htmlTags.has(tag) && !officeTags.has(tag)) {
      valid = false
      return ''
    }
    if (close) return `</${tag}>`
    const fragment = parseFragment(`<i${rawAttrs.replace(/\/\s*$/, '')}></i>`) as Node
    const element = fragment.childNodes?.find(node => node.tagName === 'i')
    if (!element) {
      valid = false
      return ''
    }
    return `<${tag}${cleanAttributes(tag, element.attrs || [], true)}>`
  })
  if (!valid || /<\s*[^/!a-z]/i.test(body)) return ''
  return `<!--[if ${match[1]}]>${body}<![endif]-->`
}

export function sanitizeImportedEmailDocument(input: string): { html: string, width: number } {
  const tree = parse(input, { scriptingEnabled: false }) as Node
  let nodes = 0
  let width = 600
  function clean(node: Node, depth = 0): string {
    if (++nodes > 50000 || depth > 100) throw new Error('Email HTML exceeds the import limit')
    if (node.nodeName === '#documentType') return '<!DOCTYPE html>'
    if (node.nodeName === '#comment') return conditional(node.data || '')
    if (node.nodeName === '#text') return escape(node.value || '')
    const tag = node.tagName
    if (!tag) return (node.childNodes || []).map(child => clean(child, depth + 1)).join('')
    if (!htmlTags.has(tag)) return ''
    if (tag === 'meta') {
      const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]))
      if (attrs.charset || attrs['http-equiv']?.toLowerCase() === 'content-type') return '<meta charset="utf-8">'
      if (['viewport', 'format-detection', 'x-apple-disable-message-reformatting', 'color-scheme', 'supported-color-schemes'].includes(attrs.name)) return `<meta name="${escape(attrs.name)}" content="${escape(attrs.content || '')}">`
      return ''
    }
    if (tag === 'link') {
      const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]))
      // The only external stylesheet supported by this import mode is the
      // supplied Google Fonts CSS endpoint; no arbitrary stylesheet/import URL.
      try {
        const url = new URL(attrs.href)
        if (attrs.rel === 'stylesheet' && publicEmailUrl(attrs.href) && url.hostname === 'fonts.googleapis.com' && url.pathname === '/css') return `<link rel="stylesheet" href="${escape(attrs.href)}">`
      } catch { /* Unknown links are omitted. */ }
      return ''
    }
    if (tag === 'style') return `<style>${sanitizeEmailCss((node.childNodes || []).map(child => child.value || '').join(''))}</style>`
    const declaredWidth = Number(node.attrs?.find(attr => attr.name === 'width')?.value)
    if (tag === 'table' && declaredWidth >= 320 && declaredWidth <= 960) width = Math.max(width, declaredWidth)
    const attrs = cleanAttributes(tag, node.attrs || [])
    const children = (node.childNodes || []).map(child => clean(child, depth + 1)).join('')
    return `<${tag}${attrs}>${children}${['img', 'br', 'hr', 'col'].includes(tag) ? '' : `</${tag}>`}`
  }
  return { html: clean(tree), width }
}
