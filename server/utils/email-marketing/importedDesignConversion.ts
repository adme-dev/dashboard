/* Explicit, reversible conversion of a complete imported email into a NEW
 * structured composer document. The original imported source is never changed.
 *
 * A small cascade resolver applies the document's own stylesheet (base rules
 * plus max-width "mobile" media rules) so each section can be lifted out of the
 * document without its <head>. Only sections whose resolved content maps
 * losslessly onto existing composer blocks become native blocks; everything
 * else is kept as a protected Html section under the existing fragment policy.
 * Desktop/mobile alternatives become paired blocks with hideOnMobile /
 * hideOnDesktop instead of duplicated content. */
import { parse } from 'parse5'
import postcss from 'postcss'
import { publicEmailUrl } from '../../../shared/emailRendering/importedDocument'
import { sanitizeImportedFragment } from './templateImport'
import type { EdmFlyhubBlock, EdmFlyhubDocument } from '../../../app/types/edm'

type PNode = { nodeName: string, tagName?: string, value?: string, attrs?: { name: string, value: string }[], childNodes?: PNode[], parentNode?: PNode | null }
type Variant = 'desktop' | 'mobile'
type Compound = { tag?: string, id?: string, classes: string[] }
type Selector = { parts: Compound[], combinators: string[], specificity: number }
type Decl = { prop: string, value: string, important: boolean }
type Rule = { selectors: Selector[], decls: Decl[], order: number, media: 'all' | Variant }
type Winner = Decl & { rank: number[] }
type RElement = { tag: string, attrs: Record<string, string>, style: Map<string, string>, children: RNode[] }
type RNode = RElement | { text: string }

export interface ConversionSection {
  id: string
  kind: 'Image' | 'Text' | 'Spacer' | 'Html'
  variant: 'both' | Variant
  label: string
  reason?: string
}
export interface ImportedConversionReport {
  width: number
  sections: ConversionSection[]
  native: number
  protected: number
  responsivePairs: number
  limitations: string[]
}

const INHERITED = ['font-family', 'font-size', 'font-weight', 'font-style', 'color', 'line-height', 'letter-spacing', 'text-align', 'text-transform']
const CARRIED = INHERITED.filter(prop => prop !== 'text-transform')
const TEXT_TAGS = new Set('p span br b strong i em u s small sup sub a font h1 h2 h3 h4 h5 h6 ul ol li blockquote center div'.split(' '))
const WRAPPER_TAGS = new Set(['table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'div', 'center'])
const VOID = new Set(['img', 'br', 'hr', 'col'])
const FOLDABLE = new Set(['span', 'strong', 'b', 'em', 'i', 'font', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'center'])
const NON_CONTENT = new Set(['style', 'title', 'head', 'meta', 'link', 'script'])
const MAX_ELEMENTS = 50000

const isElement = (node: PNode): boolean => typeof node.tagName === 'string'
const attr = (node: PNode, name: string) => node.attrs?.find(entry => entry.name === name)?.value
const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (value: string) => escapeText(value).replace(/"/g, '&quot;')
const px = (value: string | undefined) => {
  const match = value ? /^\s*(-?\d+(?:\.\d+)?)(?:px)?\s*$/i.exec(value) : null
  return match ? Number(match[1]) : null
}

function parseSelector(text: string): Selector | null {
  const tokens = text.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/)
  const parts: Compound[] = []
  const combinators: string[] = []
  let pending = ' '
  let specificity = 0
  for (const token of tokens) {
    if (token === '>') {
      pending = '>'
      continue
    }
    const match = /^([a-z][a-z0-9]*|\*)?((?:[.#][A-Za-z_][\w-]*)*)$/i.exec(token)
    if (!match || (!match[1] && !match[2])) return null
    const compound: Compound = { classes: [] }
    if (match[1] && match[1] !== '*') {
      compound.tag = match[1].toLowerCase()
      specificity += 1
    }
    for (const part of match[2].match(/[.#][\w-]+/g) ?? []) {
      if (part[0] === '#') {
        compound.id = part.slice(1)
        specificity += 10000
      } else {
        compound.classes.push(part.slice(1))
        specificity += 100
      }
    }
    if (parts.length) combinators.push(pending)
    pending = ' '
    parts.push(compound)
  }
  return parts.length ? { parts, combinators, specificity } : null
}

/** Media rules outside this classification (dark mode, WebKit-only interactive
 * content, print, resolution) are deliberately not applied: the conversion keeps
 * the portable fallback each source already provides for other clients. */
function mediaVariant(params: string): 'all' | Variant | null {
  const media = params.toLowerCase()
  if (/prefers-color-scheme|print|pixel-ratio|resolution|orientation|hover|pointer/.test(media)) return null
  const max = /max-(?:device-)?width\s*:\s*(\d+)/.exec(media)
  const min = /min-(?:device-)?width/.test(media)
  if (max && !min) return Number(max[1]) < 1024 ? 'mobile' : 'all'
  if (min && !max) return 'desktop'
  return /^\s*(?:only\s+)?(?:screen|all)\s*$/.test(media) ? 'all' : null
}

function collectRules(styles: string[], limits: Set<string>): Rule[] {
  const rules: Rule[] = []
  let order = 0
  const add = (rule: postcss.Rule, media: 'all' | Variant) => {
    const selectors = rule.selectors.map(parseSelector)
    if (selectors.some(selector => !selector)) limits.add('Client-specific stylesheet selectors (pseudo-classes, attribute hacks) are not carried into the editable copy.')
    const decls: Decl[] = []
    rule.walkDecls(decl => void decls.push({ prop: decl.prop.toLowerCase(), value: decl.value.trim(), important: decl.important }))
    const parsed = selectors.filter((selector): selector is Selector => !!selector)
    if (parsed.length && decls.length) rules.push({ selectors: parsed, decls, order: order++, media })
  }
  for (const css of styles) {
    let root: postcss.Root
    try {
      root = postcss.parse(css, { from: undefined })
    } catch {
      continue
    }
    for (const node of root.nodes) {
      if (node.type === 'rule') add(node, 'all')
      else if (node.type === 'atrule' && node.name.toLowerCase() === 'media') {
        const media = mediaVariant(node.params)
        if (media === null) {
          if (/prefers-color-scheme/i.test(node.params)) limits.add('Dark-mode stylesheet rules are not carried; use the composer dark-mode settings.')
          else limits.add('WebKit-only or device-specific interactive content uses its portable fallback.')
          continue
        }
        node.walkRules(rule => add(rule, media))
      } else if (node.type === 'atrule' && node.name.toLowerCase() === 'font-face') {
        limits.add('Custom web fonts (@font-face) fall back to each section\'s declared font stack.')
      }
    }
  }
  return rules
}

function parentElement(node: PNode): PNode | null {
  const parent = node.parentNode
  return parent && isElement(parent) ? parent : null
}
function matchCompound(node: PNode, compound: Compound): boolean {
  if (compound.tag && node.tagName !== compound.tag) return false
  if (compound.id && attr(node, 'id') !== compound.id) return false
  if (!compound.classes.length) return true
  const classes = (attr(node, 'class') || '').split(/\s+/)
  return compound.classes.every(name => classes.includes(name))
}
function matches(node: PNode, selector: Selector, index = selector.parts.length - 1): boolean {
  if (!matchCompound(node, selector.parts[index])) return false
  if (index === 0) return true
  let parent = parentElement(node)
  if (selector.combinators[index - 1] === '>') return !!parent && matches(parent, selector, index - 1)
  for (; parent; parent = parentElement(parent)) if (matches(parent, selector, index - 1)) return true
  return false
}

function inlineDecls(style: string | undefined): Decl[] {
  if (!style) return []
  try {
    const decls: Decl[] = []
    postcss.parse(`x{${style}}`, { from: undefined }).walkDecls(decl => void decls.push({ prop: decl.prop.toLowerCase(), value: decl.value.trim(), important: decl.important }))
    return decls
  } catch {
    return []
  }
}

const higher = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}

/** Resolved per-element declarations for one viewport variant. */
function computeStyles(elements: PNode[], rules: Rule[], variant: Variant): Map<PNode, Map<string, string>> {
  const result = new Map<PNode, Map<string, string>>()
  for (const element of elements) {
    const winners = new Map<string, Winner>()
    const offer = (decl: Decl, rank: number[]) => {
      const current = winners.get(decl.prop)
      if (!current || higher(rank, current.rank)) winners.set(decl.prop, { ...decl, rank })
    }
    for (const rule of rules) {
      if (rule.media !== 'all' && rule.media !== variant) continue
      let specificity = -1
      for (const selector of rule.selectors) if (selector.specificity > specificity && matches(element, selector)) specificity = selector.specificity
      if (specificity < 0) continue
      for (const decl of rule.decls) offer(decl, [decl.important ? 1 : 0, 0, specificity, rule.order])
    }
    inlineDecls(attr(element, 'style')).forEach((decl, index) => offer(decl, [decl.important ? 1 : 0, 1, 0, index]))
    const ordered = [...winners.values()].sort((a, b) => higher(a.rank, b.rank) ? 1 : -1)
    result.set(element, new Map(ordered.filter(decl => !decl.prop.startsWith('mso-')).map(decl => [decl.prop, decl.value])))
  }
  return result
}

function hidden(style: Map<string, string> | undefined): boolean {
  if (!style) return false
  if (style.get('display')?.toLowerCase() === 'none') return true
  return px(style.get('max-height')) === 0 && /hidden/i.test(style.get('overflow') || '')
}

class Resolver {
  readonly styles: Record<Variant, Map<PNode, Map<string, string>>>
  constructor(elements: PNode[], rules: Rule[]) {
    this.styles = { desktop: computeStyles(elements, rules, 'desktop'), mobile: computeStyles(elements, rules, 'mobile') }
  }

  style(node: PNode, variant: Variant) {
    return this.styles[variant].get(node) ?? new Map<string, string>()
  }

  visible(node: PNode, variant: Variant): boolean {
    for (let current: PNode | null = node; current; current = parentElement(current)) if (hidden(this.styles[variant].get(current))) return false
    return true
  }

  /** Nearest painted ancestor fill behind a lifted section. */
  fill(node: PNode, variant: Variant): Fill {
    for (let parent = parentElement(node); parent; parent = parentElement(parent)) {
      const fill = solidFill(this.style(parent, variant), attr(parent, 'bgcolor'))
      if (fill.value || !fill.exact) return fill
    }
    return { value: null, exact: true }
  }

  /** Inherited text properties from ancestors outside a lifted section. */
  inherited(node: PNode, variant: Variant): Map<string, string> {
    const inherited = new Map<string, string>()
    const chain: PNode[] = []
    for (let parent = parentElement(node); parent; parent = parentElement(parent)) chain.unshift(parent)
    for (const element of chain) {
      const style = this.style(element, variant)
      for (const prop of INHERITED) if (style.has(prop) && !/inherit/i.test(style.get(prop)!)) inherited.set(prop, style.get(prop)!)
    }
    return inherited
  }

  /** Text transforms are applied to the text itself: the fragment policy used
   * for composer Html/Text markup does not carry text-transform. */
  resolve(node: PNode, variant: Variant, transform = 'none'): RNode | null {
    if (node.nodeName === '#text') return { text: applyTransform(node.value || '', transform) }
    if (!isElement(node) || NON_CONTENT.has(node.tagName!) || hidden(this.styles[variant].get(node))) return null
    const attrs: Record<string, string> = {}
    for (const entry of node.attrs || []) if (!['class', 'style', 'id'].includes(entry.name)) attrs[entry.name] = entry.value
    const computed = this.style(node, variant)
    const own = computed.get('text-transform')?.toLowerCase()
    const next = own && own !== 'inherit' ? own : transform
    const style = new Map([...computed].filter(([prop]) => prop !== 'text-transform' && (prop !== 'display' || node.tagName !== 'img')))
    const children = (node.childNodes || []).map(child => this.resolve(child, variant, next)).filter((child): child is RNode => !!child)
    return { tag: node.tagName!, attrs, style, children }
  }
}

function applyTransform(text: string, transform: string): string {
  if (!['uppercase', 'lowercase', 'capitalize'].includes(transform)) return text
  // Merge tokens keep their exact case; only literal copy is transformed.
  return text.split(/(\{\{[^{}]*\}\}|\*\|[^|]*\|\*)/).map((part, index) => {
    if (index % 2) return part
    if (transform === 'uppercase') return part.toUpperCase()
    if (transform === 'lowercase') return part.toLowerCase()
    return part.replace(/(^|\s)(\S)/g, (_match, space: string, letter: string) => space + letter.toUpperCase())
  }).join('')
}

function serialize(node: RNode, dropped: { backgrounds: number, lifted?: string | null }): string {
  if ('text' in node) return escapeText(node.text)
  const liftedHere = !!dropped.lifted && backgroundUrl(node) === dropped.lifted
  // The lifted image is painted by the block; its fill sat underneath it.
  let declarations = [...node.style].filter(([prop]) => !liftedHere || !/^background(?:-color)?$/.test(prop))
  const before = declarations.length
  declarations = declarations.filter(([, value]) => !/url\s*\(/i.test(value))
  if ((declarations.length !== before || node.attrs.background) && backgroundUrl(node) !== dropped.lifted) dropped.backgrounds++
  const attrs = Object.entries(node.attrs).filter(([name]) => name !== 'background' && (!liftedHere || name !== 'bgcolor'))
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('')
  const style = declarations.length ? ` style="${escapeAttr(declarations.map(([prop, value]) => `${prop}:${value}`).join(';'))}"` : ''
  const open = `<${node.tag}${attrs}${style}>`
  return VOID.has(node.tag) ? open : `${open}${node.children.map(child => serialize(child, dropped)).join('')}</${node.tag}>`
}

const textOf = (node: RNode): string => 'text' in node ? node.text : node.children.map(textOf).join('')
const elementsOf = (node: RNode, tag?: string): RElement[] => 'text' in node ? [] : [...(!tag || node.tag === tag ? [node] : []), ...node.children.flatMap(child => elementsOf(child, tag))]
const INVISIBLE = /(?:\s|\u00a0|[\u200b-\u200d]|\u034f|\ufeff)+/g
const meaningfulText = (node: RNode) => textOf(node).replace(INVISIBLE, '')

function padding(style: Map<string, string>, property = 'padding'): [number, number, number, number] | null {
  const box: [number, number, number, number] = [0, 0, 0, 0]
  const shorthand = style.get(property)
  if (shorthand) {
    const values = shorthand.trim().split(/\s+/).map(value => property === 'margin' && /^auto$/i.test(value) ? 0 : px(value))
    if (values.some(value => value === null) || values.length > 4) return null
    const [top, right = top, bottom = top, left = right] = values as number[]
    box.splice(0, 4, top, right, bottom, left)
  }
  const sides = ['top', 'right', 'bottom', 'left']
  for (const [index, side] of sides.entries()) {
    const value = style.get(`${property}-${side}`)
    if (value === undefined) continue
    const parsed = property === 'margin' && /^auto$/i.test(value) ? 0 : px(value)
    if (parsed === null) return null
    box[index] = parsed
  }
  return box
}
const NAMED_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', maroon: '#800000', navy: '#000080', purple: '#800080', teal: '#008080', olive: '#808000', lime: '#00ff00', aqua: '#00ffff',
  fuchsia: '#ff00ff', orange: '#ffa500'
}
/** Canonical opaque hex; null when absent/transparent; false when the colour
 * cannot be represented exactly (translucent, keywords, functions we do not map). */
function parseColor(value: string | undefined): string | null | false {
  const v = (value ?? '').trim().toLowerCase()
  if (!v || ['transparent', 'inherit', 'initial', 'unset', 'none'].includes(v)) return null
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map(digit => digit + digit).join('')}`
  if (Object.hasOwn(NAMED_COLORS, v)) return NAMED_COLORS[v]
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*(\d*\.?\d+%?)\s*)?\)$/.exec(v)
  if (!rgb) return false
  const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4])
  const channels = rgb.slice(1, 4).map(Number)
  if (alpha < 1 || channels.some(channel => channel > 255)) return false
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}
const color = (value: string | undefined) => parseColor(value) || null
/** A public HTTPS background image URL that the shared style sanitiser accepts. */
function backgroundUrl(node: RElement): string | null {
  const source = node.attrs.background || /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i.exec(`${node.style.get('background-image') || ''} ${node.style.get('background') || ''}`)?.[1] || ''
  return publicEmailUrl(source) && !/["')(\\<>]/.test(source) ? source : null
}
// Solid gradients are a common dark-mode hack; only url() paints an image.
const imageBackground = (node: RElement) => /url\s*\(/i.test(`${node.style.get('background-image') || ''} ${node.style.get('background') || ''}`) || !!node.attrs.background
type Fill = { value: string | null, exact: boolean }
/** The painted fill: colour declarations, bgcolor and same-colour gradients.
 * `value` is canonical hex when exact; otherwise the source's own colour text
 * so protected sections still paint it, while native mapping refuses it. */
function solidFill(style: Map<string, string>, bgcolor: string | undefined): Fill {
  const gradient = (value: string | undefined) => {
    const match = value ? /^linear-gradient\(\s*([^,()]+|rgba?\([^)]*\))\s*,\s*([^,()]+|rgba?\([^)]*\))\s*\)$/i.exec(value.trim()) : null
    return match && match[1].trim().toLowerCase() === match[2].trim().toLowerCase() ? match[1].trim() : undefined
  }
  const shorthand = style.get('background')
  const shorthandColor = shorthand?.replace(/url\([^)]*\)|linear-gradient\((?:[^()]|\([^)]*\))*\)/gi, ' ')
    .match(/rgba?\([^)]*\)|#[0-9a-f]{3,6}\b|[a-z]+/gi)?.find(token => parseColor(token) !== false || /^rgba?\(/i.test(token))
  for (const candidate of [style.get('background-color'), gradient(shorthand) ?? shorthandColor, gradient(style.get('background-image')), bgcolor]) {
    if (candidate === undefined || !candidate.trim()) continue
    const parsed = parseColor(candidate)
    if (parsed === null) return { value: null, exact: true }
    if (parsed) return { value: parsed, exact: true }
    const raw = candidate.trim()
    return { value: /^(?:rgba?|hsla?)\([\d\s.,%/]+\)$/i.test(raw) ? raw : null, exact: false }
  }
  return { value: null, exact: true }
}
const background = (node: RElement) => solidFill(node.style, node.attrs.bgcolor)

type Frame = { padding: [number, number, number, number], background: string | null, align: string | null, image?: string | null, imageFill?: string | null, exact?: boolean }
type Leaf = { block: EdmFlyhubBlock, kind: ConversionSection['kind'], node: RNode, reason?: string }
const NO_FRAME: Frame = { padding: [0, 0, 0, 0], background: null, align: null }

/** Single-path wrapper chain from a section to its innermost content cell. */
function contentChain(root: RElement): { chain: RElement[], cell: RElement } {
  const chain: RElement[] = []
  let node: RElement = root
  for (;;) {
    chain.push(node)
    const elements = node.children.filter((child): child is RElement => !('text' in child))
    const strayText = node.children.some(child => 'text' in child && meaningfulText(child))
    const only = elements.length === 1 && !strayText ? elements[0] : null
    if (!only || !WRAPPER_TAGS.has(only.tag) || (only.tag === 'div' && only.children.every(child => 'text' in child || TEXT_TAGS.has(child.tag)))) return { chain, cell: node }
    node = only
  }
}

function frame(chain: RElement[], outer: Frame): Frame | null {
  const total: [number, number, number, number] = [...outer.padding]
  // Fills that cannot be represented exactly keep the whole group protected.
  if (outer.exact === false && outer.background) return null
  let fill = outer.background
  let align = outer.align
  let image = outer.image ?? null
  let imageFill = outer.imageFill ?? null
  for (const node of chain) {
    const box = padding(node.style)
    const margin = padding(node.style, 'margin')
    if (!box || !margin || margin[1] || margin[3] || margin[0] < 0 || margin[2] < 0) return null
    const painted = background(node)
    if (!painted.exact) return null
    const bg = painted.value
    // Vertical margins paint the outer fill; they become padding only when the
    // element shares that fill.
    if ((margin[0] || margin[2]) && bg && bg !== fill) return null
    box[0] += margin[0]
    box[2] += margin[2]
    box.forEach((value, index) => {
      total[index] += value
    })
    if (bg && bg !== fill) {
      // A nested fill inside padding would paint a different box than the block.
      if (fill && total.some((value, index) => value - box[index] > 0)) return null
      fill = bg
    }
    if (imageBackground(node)) {
      // One background image may become the block's structured, URL-checked
      // style when it paints the whole block (no padding outside it).
      const url = backgroundUrl(node)
      if (!url || image || total.some((value, index) => value - box[index] > 0)) return null
      image = url
      // The image's own fill sits under it and becomes the block fallback.
      imageFill = fill
    }
    if ([...node.style].some(([prop, value]) => /^border(?!-collapse|-spacing)/.test(prop) && !/^(?:0|none|0px)\b/i.test(value))) return null
    align = node.style.get('text-align') || node.attrs.align || align
  }
  return { padding: total, background: fill, align, image, imageFill, exact: true }
}

const inheritFrom = (inherited: Map<string, string>, chain: RElement[]) => {
  const next = new Map(inherited)
  for (const node of chain) for (const prop of CARRIED) if (node.style.has(prop) && !/inherit/i.test(node.style.get(prop)!)) next.set(prop, node.style.get(prop)!)
  return next
}

function leaf(chain: RElement[], cell: RElement, box: Frame, width: number, inherited: Map<string, string>): Leaf | null {
  const images = elementsOf(cell, 'img')
  const text = meaningfulText(cell)
  const style: NonNullable<EdmFlyhubBlock['data']['style']> = {
    padding: { top: box.padding[0], right: box.padding[1], bottom: box.padding[2], left: box.padding[3] }
  }
  if (box.background) style.backgroundColor = box.background
  if (box.image) style.backgroundImage = box.image
  if (!images.length && !text && !elementsOf(cell, 'hr').length && !elementsOf(cell, 'a').length) {
    if (box.image) return null
    const heights = chain.flatMap(node => [px(node.attrs.height), px(node.style.get('height')), px(node.style.get('line-height')), px(node.style.get('font-size'))])
      .filter((value): value is number => value !== null)
    const height = Math.round(Math.max(0, ...heights) + box.padding[0] + box.padding[2])
    if (height < 1 || height > 200 || box.padding[1] + box.padding[3] > 0) return null
    return { kind: 'Spacer', node: cell, block: { type: 'Spacer', data: { style: box.background ? { backgroundColor: box.background } : null, props: { height } } } }
  }
  if (images.length === 1 && !text && !elementsOf(cell, 'table').length) {
    const image = images[0]
    const links = elementsOf(cell, 'a')
    if (links.length > 1 || (links.length === 1 && !elementsOf(links[0], 'img').length)) return null
    const src = image.attrs.src || ''
    const href = links[0]?.attrs.href || ''
    if (!publicEmailUrl(src) || (href && !publicEmailUrl(href, true))) return null
    const available = width - box.padding[1] - box.padding[3]
    // Every wrapper between the section edge and the image must allow the
    // full content width; narrower images keep their source sizing.
    const constrained = [...chain, ...pathTo(cell, image)].some(node => node !== image && [node.attrs.width, node.style.get('width'), node.style.get('max-width')]
      .some(value => /%\s*$/.test(value || '') ? parseFloat(value!) < 100 : px(value) !== null && px(value)! < available - 2))
    const declared = image.style.get('width') ?? image.attrs.width
    const full = !constrained && (/^100%$/.test((declared || '').trim()) || (px(declared) !== null && Math.abs(px(declared)! - available) <= 2))
    if (!full) return null
    return { kind: 'Image', node: cell, block: { type: 'Image', data: { style, props: { url: src, alt: image.attrs.alt || '', ...(href ? { linkHref: href } : {}), contentAlignment: 'center' } } } }
  }
  if (images.length || !text || elementsOf(cell).some(node => node !== cell && !TEXT_TAGS.has(node.tag))) return null
  if (elementsOf(cell, 'a').some(link => !link.attrs.href || !publicEmailUrl(link.attrs.href, true))) return null
  const resolved = inheritFrom(inherited, chain)
  if (box.align) resolved.set('text-align', box.align)
  // Copy whose colour cannot be represented exactly stays protected.
  if (parseColor(resolved.get('color')) === false) return null
  // A single wrapper around all copy (span/strong/p...) is presentational: fold
  // its typography into the block so plain copy remains a plain, editable field.
  let content = cell.children
  for (;;) {
    const significant = content.filter(child => !('text' in child) || child.text.replace(INVISIBLE, ''))
    const only = significant.length === 1 && !('text' in significant[0]) ? significant[0] : null
    if (!only || !FOLDABLE.has(only.tag) || Object.keys(only.attrs).some(name => !['dir', 'align'].includes(name))
      || [...only.style].some(([prop, value]) => !CARRIED.includes(prop) && !(prop === 'text-decoration' && /^none$/i.test(value)) && !(/^(?:margin|padding)/.test(prop) && /^0(?:px)?(?:\s+0(?:px)?)*$/.test(value)))) break
    if (parseColor(only.style.get('color')) === false) break
    for (const prop of CARRIED) if (only.style.has(prop) && !/inherit/i.test(only.style.get(prop)!)) resolved.set(prop, only.style.get(prop)!)
    if (['strong', 'b', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(only.tag) && !only.style.has('font-weight')) resolved.set('font-weight', 'bold')
    if (only.tag === 'em' || only.tag === 'i') resolved.set('font-style', 'italic')
    content = only.children
  }
  const dropped = { backgrounds: 0 }
  const inner = content.map(child => serialize(child, dropped)).join('').trim()
  if (dropped.backgrounds) return null
  const fontSize = px(resolved.get('font-size'))
  const align = resolved.get('text-align')?.toLowerCase()
  const weight = resolved.get('font-weight')?.toLowerCase()
  const lineHeight = resolved.get('line-height')
  const spacing = px(resolved.get('letter-spacing'))
  const family = systemFont(resolved.get('font-family'))
  const copy = content.map(textOf).join('')
  const plain = family !== null && !/italic|oblique/i.test(resolved.get('font-style') || '') && content.every(child => 'text' in child) && !/[<>&]/.test(copy)
  // Typography the renderer and mobile overrides own lives on the block. Rich
  // text keeps only the remaining source font declarations in a wrapper.
  const wrapper = [...resolved].filter(([prop]) => ['font-family', 'font-style'].includes(prop)).map(([prop, value]) => `${prop}:${value}`).join(';')
  return {
    kind: 'Text',
    node: cell,
    block: {
      type: 'Text',
      data: {
        style: {
          ...style,
          ...(color(resolved.get('color')) ? { color: color(resolved.get('color')) } : {}),
          ...(fontSize ? { fontSize } : {}),
          ...(weight && /^(?:normal|bold|[1-9]00)$/.test(weight) ? { fontWeight: weight } : {}),
          ...(align === 'left' || align === 'center' || align === 'right' ? { textAlign: align } : {}),
          ...(lineHeight && /^(?:\d+(?:\.\d+)?)(?:px|%|em)?$/.test(lineHeight) ? { lineHeight } : {}),
          ...(spacing ? { letterSpacing: spacing } : {}),
          ...(plain && family ? { fontFamily: family } : {})
        },
        props: { text: plain ? copy.replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, '') : sanitizeImportedFragment(wrapper ? `<div style="${escapeAttr(wrapper)}">${inner}</div>` : inner) }
      }
    }
  }
}

/** Plain text can only use the renderer's named stacks; others stay rich. */
function systemFont(stack: string | undefined): string | null {
  if (!stack) return 'MODERN_SANS'
  // Custom web fonts are not carried (no @font-face), so the first standard
  // family in the stack is what the copy already renders in.
  const fonts = stack.toLowerCase().split(',').map(font => font.trim().replace(/^['"]|['"]$/g, ''))
  const first = fonts.find(font => ['arial', 'helvetica', 'helvetica neue', 'sans-serif', 'georgia', 'times new roman', 'serif', 'courier new', 'monospace'].includes(font))
  if (!first) return null
  return /georgia|times|^serif/.test(first) ? 'MODERN_SERIF' : /courier|mono/.test(first) ? 'MONOSPACE' : 'MODERN_SANS'
}

function pathTo(root: RElement, target: RElement): RElement[] {
  if (root === target) return [root]
  for (const child of root.children) {
    if ('text' in child) continue
    const path = pathTo(child, target)
    if (path.length) return [root, ...path]
  }
  return []
}
/** Side-by-side flow: inline blocks, floats and left/right aligned tables. */
const inlineFlow = (node: RElement) => /inline|table-cell/i.test(node.style.get('display') || '') || /left|right/i.test(node.style.get('float') || '')
  || (node.tag === 'table' && /^(?:left|right)$/i.test(node.attrs.align || ''))

/** Vertically stacked children of a content cell, or null for any other layout. */
function stack(cell: RElement): RElement[] | null {
  if (cell.children.some(child => 'text' in child && meaningfulText(child))) return null
  if (cell.children.some(child => !('text' in child) && inlineFlow(child))) return null
  const elements = cell.children.filter((child): child is RElement => !('text' in child) && (!!meaningfulText(child) || elementsOf(child, 'img').length > 0 || elementsOf(child).some(node => px(node.attrs.height) || px(node.style.get('height')))))
  if (['table', 'tbody', 'thead', 'tfoot'].includes(cell.tag)) {
    const rows = elements.flatMap(child => ['tbody', 'thead', 'tfoot'].includes(child.tag) ? child.children.filter((row): row is RElement => !('text' in row)) : [child])
    if (rows.some(row => row.tag !== 'tr' || row.children.filter(item => !('text' in item)).length !== 1)) return null
    return rows.length > 1 ? rows : null
  }
  if (['tr'].includes(cell.tag)) return null
  if (elements.some(child => ['td', 'th', 'tr', 'img', 'a', 'span', 'b', 'strong', 'i', 'em', 'u', 'font', 'br'].includes(child.tag) || (px(child.style.get('width')) !== null && /inline/.test(child.style.get('display') || '')))) return null
  return elements.length > 1 ? elements : null
}

function protectedBlock(node: RElement, outer: Frame, width: number, inherited: Map<string, string>, dropped: { backgrounds: number }, image: string | null = null, imageFill: string | null = null): EdmFlyhubBlock {
  const style = new Map(inherited)
  style.set('width', '100%')
  const cell: RElement = { tag: 'td', attrs: {}, style: new Map([
    ...(outer.padding.some(Boolean) ? [['padding', outer.padding.map(value => `${value}px`).join(' ')] as [string, string]] : []),
    ...(outer.background && !image ? [['background-color', outer.background] as [string, string]] : []),
    ...(outer.align ? [['text-align', outer.align] as [string, string]] : [])
  ]), children: [] }
  if (node.tag === 'tr') cell.children.push({ tag: 'table', attrs: { role: 'presentation', width: '100%', cellpadding: '0', cellspacing: '0', border: '0' }, style: new Map([['width', '100%']]), children: [node] })
  else if (['td', 'th'].includes(node.tag)) cell.children.push({ tag: 'table', attrs: { role: 'presentation', width: '100%', cellpadding: '0', cellspacing: '0', border: '0' }, style: new Map([['width', '100%']]), children: [{ tag: 'tr', attrs: {}, style: new Map(), children: [node] }] })
  else cell.children.push(node)
  const table: RElement = { tag: 'table', attrs: { role: 'presentation', width: '100%', cellpadding: '0', cellspacing: '0', border: '0' }, style, children: [{ tag: 'tr', attrs: {}, style: new Map(), children: [cell] }] }
  const local = { backgrounds: 0, lifted: image }
  const contents = sanitizeImportedFragment(serialize(table, local))
  dropped.backgrounds += local.backgrounds
  return { type: 'Html', data: { style: { padding: { top: 0, right: 0, bottom: 0, left: 0 }, ...(image ? { backgroundImage: image, ...((imageFill ?? outer.background) ? { backgroundColor: imageFill ?? outer.background } : {}) } : {}) }, props: { contents } } }
}

function reasonFor(cell: RElement): string {
  if (elementsOf(cell).some(imageBackground)) return 'Background image'
  if (elementsOf(cell).some(node => (node.tag === 'td' || node.tag === 'th') && node !== cell) && elementsOf(cell, 'tr').some(row => row.children.filter(item => !('text' in item)).length > 1)) return 'Side-by-side columns'
  if (elementsOf(cell, 'a').some(link => !elementsOf(link, 'img').length && elementsOf(cell).some(node => background(node).value))) return 'Styled button'
  if (elementsOf(cell, 'img').length) return 'Image sized or combined with other content'
  if (elementsOf(cell).some(node => [...node.style].some(([prop, value]) => /^border(?!-collapse|-spacing)/.test(prop) && !/^(?:0|none|0px)\b/i.test(value)))) return 'Borders or rounded styling'
  return 'Layout not supported natively'
}

function decompose(node: RElement, outer: Frame, width: number, inherited: Map<string, string>, dropped: { backgrounds: number }, depth = 0): Leaf[] {
  const { chain, cell } = contentChain(node)
  const box = frame(chain, outer)
  const nextInherited = inheritFrom(inherited, chain)
  if (box) {
    const mapped = leaf(chain, cell, box, width, inherited)
    if (mapped) return [mapped]
    // A background image paints the whole group: never split it across blocks.
    const items = depth < 8 && !box.image ? stack(cell) : null
    if (items) {
      return items.flatMap((item, index) => decompose(item, {
        padding: [index === 0 ? box.padding[0] : 0, box.padding[1], index === items.length - 1 ? box.padding[2] : 0, box.padding[3]],
        background: box.background,
        align: box.align,
        image: null,
        exact: true
      }, width, nextInherited, dropped, depth + 1))
    }
  }
  const lifted = box?.image && !outer.padding.some(Boolean) ? box.image : null
  return [{ kind: 'Html', node, reason: reasonFor(cell), block: protectedBlock(node, outer, width, inherited, dropped, lifted, lifted ? box!.imageFill ?? null : null) }]
}

const MOBILE_STYLE_KEYS = new Set(['padding', 'color', 'backgroundColor', 'fontSize', 'fontWeight', 'textAlign', 'lineHeight', 'letterSpacing', 'textTransform'])
/** One block with a mobile style override when only supported styles differ. */
function mergeVariants(desktop: Leaf, mobile: Leaf): EdmFlyhubBlock | null {
  if (desktop.kind !== mobile.kind || desktop.kind === 'Html') return null
  // Image alternates differing only by file/alt become one image with a mobile
  // source; FigFlow then shows one layer instead of two stacked copies.
  const props = { ...desktop.block.data.props }
  const other = { ...mobile.block.data.props }
  const mobileProps: Record<string, unknown> = {}
  if (desktop.kind === 'Image') {
    for (const key of ['url', 'alt']) {
      if (props[key] !== other[key]) mobileProps[key] = other[key]
      other[key] = props[key]
    }
  }
  if (JSON.stringify(props) !== JSON.stringify(other)) return null
  const before = desktop.block.data.style ?? {}
  const after = mobile.block.data.style ?? {}
  const diff: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = JSON.stringify((before as Record<string, unknown>)[key] ?? null)
    const b = JSON.stringify((after as Record<string, unknown>)[key] ?? null)
    if (a === b) continue
    if (!MOBILE_STYLE_KEYS.has(key) || (after as Record<string, unknown>)[key] === undefined) return null
    diff[key] = (after as Record<string, unknown>)[key]
  }
  const mobileOverride = { ...(Object.keys(diff).length ? { style: diff } : {}), ...(Object.keys(mobileProps).length ? { props: mobileProps } : {}) }
  return { ...desktop.block, data: { ...desktop.block.data, ...(Object.keys(mobileOverride).length ? { mobile: mobileOverride } : {}) } }
}

function label(node: RNode): string {
  const text = textOf(node).replace(INVISIBLE, ' ').trim()
  const images = elementsOf(node, 'img')
  if (text) return text.length > 60 ? `${text.slice(0, 57)}...` : text
  return images.length ? `${images.length} image${images.length > 1 ? 's' : ''}${images[0].attrs.alt ? `: ${images[0].attrs.alt.slice(0, 40)}` : ''}` : 'Layout section'
}

export class ImportedConversionError extends Error {}

/** Converts sanitized full-document import contents to a structured composer
 * document plus an explicit report. Pure and deterministic for one input. */
export function convertImportedEmailDocument(source: unknown): { document: EdmFlyhubDocument, report: ImportedConversionReport } {
  const doc = source as EdmFlyhubDocument
  const childIds = doc?.root?.data?.childrenIds
  const imported = childIds?.length === 1 ? doc[childIds[0]] : null
  if (!imported || imported.type !== 'Html' || imported.data.props?.documentMode !== 'email' || typeof imported.data.props.contents !== 'string')
    throw new ImportedConversionError('Only a complete imported email can be converted into an editable copy.')
  const width = Number(doc.root.data.props?.contentWidth) || 600
  // Re-sanitize the stored source through the existing full-document owner.
  const tree = parse(imported.data.props.contents, { scriptingEnabled: false }) as unknown as PNode
  const elements: PNode[] = []
  const styles: string[] = []
  const walk = (node: PNode) => {
    if (isElement(node)) {
      if (elements.push(node) > MAX_ELEMENTS) throw new ImportedConversionError('Email HTML exceeds the conversion limit')
      if (node.tagName === 'style') styles.push((node.childNodes || []).map(child => child.value || '').join(''))
    }
    for (const child of node.childNodes || []) walk(child)
  }
  walk(tree)
  const limits = new Set<string>()
  const rules = collectRules(styles, limits)
  const resolver = new Resolver(elements, rules)
  const body = elements.find(node => node.tagName === 'body')
  if (!body) throw new ImportedConversionError('Imported email has no body')
  if (JSON.stringify(imported.data.props.contents).includes('[if mso')) limits.add('Outlook-only conditional fallbacks are omitted; each section keeps its standard HTML rendering.')

  const isBand = (node: PNode) => node.tagName === 'table' && [attr(node, 'width'), resolver.style(node, 'desktop').get('width'), resolver.style(node, 'desktop').get('max-width')]
    .some(value => px(value) === width)
  const hasContent = (node: PNode): boolean => node.nodeName === '#text' ? !!(node.value || '').replace(INVISIBLE, '') : isElement(node) && !NON_CONTENT.has(node.tagName!) && (node.tagName === 'img' || (node.childNodes || []).some(hasContent))
  // Fixed-height empty rows are vertical rhythm and become Spacer blocks.
  const spacing = (node: PNode): boolean => (isElement(node) && ['tr', 'td', 'th', 'table', 'div'].includes(node.tagName!)
    && (['desktop', 'mobile'] as Variant[]).some(variant => [attr(node, 'height'), resolver.style(node, variant).get('height')].some(value => (px(value) ?? 0) > 0)))
  || (isElement(node) && ['tr', 'tbody'].includes(node.tagName!) && (node.childNodes || []).some(spacing))
  const transparent = (node: PNode) => (['desktop', 'mobile'] as Variant[]).every((variant) => {
    const style = resolver.style(node, variant)
    const box = padding(style)
    return box && box.every(value => value === 0) && !attr(node, 'bgcolor') && !attr(node, 'background')
      && ![...style].some(([prop, value]) => /^background/.test(prop) || (/^border(?!-collapse|-spacing)/.test(prop) && !/^(?:0|none|0px)\b/i.test(value)))
  })
  // A pure wrapper cell holds only transparent block containers: no copy of its own.
  const wrapperOnly = (cell: PNode) => {
    const inner = (cell.childNodes || []).filter(isElement).filter(node => !NON_CONTENT.has(node.tagName!))
    return inner.length > 0 && !(cell.childNodes || []).some(node => node.nodeName === '#text' && (node.value || '').replace(/[ \t\n\r\f]+/g, ''))
      && inner.every(node => ['table', 'div', 'center'].includes(node.tagName!) && transparent(node))
  }
  const sections: PNode[] = []
  const bandRows = (node: PNode) => {
    const flatten = (current: PNode) => {
      for (const child of current.childNodes || []) {
        if (!isElement(child) || !(hasContent(child) || spacing(child)) || !(resolver.visible(child, 'desktop') || resolver.visible(child, 'mobile'))) continue
        const cells = (child.childNodes || []).filter(isElement)
        if (['tbody', 'thead', 'tfoot'].includes(child.tagName!)) flatten(child)
        else if (child.tagName === 'tr' && cells.length === 1 && transparent(child) && transparent(cells[0]) && wrapperOnly(cells[0])) {
          for (const inner of (cells[0].childNodes || []).filter(isElement)) {
            if (inner.tagName === 'table') flatten(inner)
            else visit(inner)
          }
        } else sections.push(child)
      }
    }
    flatten(node)
  }
  const visit = (node: PNode) => {
    if (!isElement(node) || !hasContent(node) || !(resolver.visible(node, 'desktop') || resolver.visible(node, 'mobile'))) return
    if (isBand(node)) return bandRows(node)
    const containsBand = (current: PNode): boolean => isElement(current) && (isBand(current) || (current.childNodes || []).some(containsBand))
    if (containsBand(node)) {
      for (const child of node.childNodes || []) visit(child)
      return
    }
    sections.push(node)
  }
  for (const child of body.childNodes || []) visit(child)
  if (!sections.length) throw new ImportedConversionError('No visible email content was found to convert.')
  if (sections.length > 140) throw new ImportedConversionError('This email has too many sections to convert safely.')

  const blocks: EdmFlyhubDocument = {}
  const rootChildren: string[] = []
  const report: ImportedConversionReport = { width, sections: [], native: 0, protected: 0, responsivePairs: 0, limitations: [] }
  const dropped = { backgrounds: 0 }
  let counter = 0
  const emit = (block: EdmFlyhubBlock, kind: ConversionSection['kind'], variant: ConversionSection['variant'], text: string, reason?: string) => {
    const id = `cv${++counter}-${kind.toLowerCase()}`
    if (variant === 'desktop') block.data.hideOnMobile = true
    if (variant === 'mobile') block.data.hideOnDesktop = true
    blocks[id] = block
    rootChildren.push(id)
    report.sections.push({ id, kind, variant, label: text, ...(reason ? { reason } : {}) })
    if (kind === 'Html') report.protected++
    else report.native++
  }
  for (const section of sections) {
    const resolved = (['desktop', 'mobile'] as Variant[]).map(variant => resolver.visible(section, variant) ? resolver.resolve(section, variant, resolver.inherited(section, variant).get('text-transform')?.toLowerCase()) as RElement | null : null)
    const leaves = resolved.map((node, index) => node && (meaningfulText(node) || elementsOf(node, 'img').length || elementsOf(node).some(item => (px(item.attrs.height) ?? px(item.style.get('height')) ?? 0) > 0))
      ? decompose(node, (fill => ({ ...NO_FRAME, background: fill.value, exact: fill.exact }))(resolver.fill(section, index ? 'mobile' : 'desktop')), width, resolver.inherited(section, index ? 'mobile' : 'desktop'), dropped)
      : [])
    const [desktop, mobile] = leaves
    if (desktop.length === mobile.length) {
      desktop.forEach((item, index) => {
        const other = mobile[index]
        const merged = mergeVariants(item, other) ?? (item.kind === 'Html' && item.block.data.props?.contents === other.block.data.props?.contents ? item.block : null)
        if (merged) return emit(merged, item.kind, 'both', label(item.node), item.reason)
        report.responsivePairs++
        emit(item.block, item.kind, 'desktop', label(item.node), item.reason)
        emit(other.block, other.kind, 'mobile', label(other.node), other.reason)
      })
      continue
    }
    if (desktop.length && mobile.length) report.responsivePairs++
    // A variant with no leaves is hidden on that device, so the other variant's
    // blocks are device-specific even when they have no counterpart.
    desktop.forEach(item => emit(item.block, item.kind, 'desktop', label(item.node), item.reason))
    mobile.forEach(item => emit(item.block, item.kind, 'mobile', label(item.node), item.reason))
  }
  // Adjacent rows that are desktop-only and mobile-only images of the same slot
  // also become one layer with a mobile source.
  for (let index = 0; index < rootChildren.length - 1; index++) {
    const [first, second] = [blocks[rootChildren[index]], blocks[rootChildren[index + 1]]]
    if (first.type !== 'Image' || second.type !== 'Image' || !!first.data.hideOnMobile === !!second.data.hideOnMobile
      || !!first.data.hideOnDesktop === !!second.data.hideOnDesktop || (first.data.hideOnMobile && first.data.hideOnDesktop) || (second.data.hideOnMobile && second.data.hideOnDesktop)) continue
    const [desktop, mobile] = first.data.hideOnMobile ? [first, second] : [second, first]
    const strip = (block: EdmFlyhubBlock): Leaf => ({ kind: 'Image', node: { text: '' }, block: { ...block, data: { ...block.data, hideOnMobile: undefined, hideOnDesktop: undefined } } })
    const merged = mergeVariants(strip(desktop), strip(mobile))
    if (!merged) continue
    delete merged.data.hideOnMobile
    delete merged.data.hideOnDesktop
    const [keep, drop] = [rootChildren[index], rootChildren[index + 1]]
    blocks[keep] = merged
    Reflect.deleteProperty(blocks, drop)
    rootChildren.splice(index + 1, 1)
    const section = report.sections.find(item => item.id === keep)!
    section.variant = 'both'
    report.sections = report.sections.filter(item => item.id !== drop)
    report.native--
  }
  if (Object.values(blocks).some(block => block.data.style?.backgroundImage)) limits.add('Background images are kept on their sections with cover/centre positioning; Outlook background fallbacks are not included.')
  if (dropped.backgrounds) limits.add(`${dropped.backgrounds} background image${dropped.backgrounds > 1 ? 's' : ''} in protected sections cannot be shown under the editor's HTML policy.`)
  if (rootChildren.length > 280) throw new ImportedConversionError('This email has too many sections to convert safely.')
  // Each section carries its own painted fill, so the canvas only matters
  // behind transparent sections: use the body's own background.
  const bodyFill = solidFill(resolver.style(body, 'desktop'), attr(body, 'bgcolor'))
  const backdrop = bodyFill.exact ? bodyFill.value : null
  const canvas = backdrop
  report.limitations = [...limits]
  return {
    document: {
      root: { type: 'EmailLayout', data: { props: { contentWidth: width, backdropColor: backdrop ?? '#ffffff', canvasColor: canvas ?? '#ffffff', textColor: '#000000', fontFamily: 'MODERN_SANS' }, childrenIds: rootChildren } },
      ...blocks
    },
    report
  }
}
