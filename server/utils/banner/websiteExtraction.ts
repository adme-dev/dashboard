import { parse, parseFragment, serializeOuter, type DefaultTreeAdapterMap } from 'parse5'
import { assertPublicSiteOrigin, createCloudflareDohResolver, type SiteIntelligenceDnsResolver } from '~~/server/utils/siteIntelligence/urlPolicy'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']
export interface BrandWebsiteDependencies { fetcher?: typeof fetch, resolver?: SiteIntelligenceDnsResolver }
const USER_AGENT = 'Mozilla/5.0 (XeroFlow brand extractor)'
const REDIRECTS = new Set([301, 302, 303, 307, 308])
const HTML_LIMIT = 2 * 1024 * 1024
const CSS_LIMIT = 256 * 1024
const LOGO_LIMIT = 2 * 1024 * 1024
const MAX_STYLESHEETS = 4

/** Every hop uses the public-origin boundary; no ambient cookies or redirect following. */
export async function fetchBrandWebsiteResource(input: string, kind: 'html' | 'css' | 'logo', deps: BrandWebsiteDependencies = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  const fetcher = deps.fetcher ?? fetch
  const controlledFetch: typeof fetch = (url, options) => fetcher(url, { ...options, signal: controller.signal, redirect: 'manual' })
  const resolver = deps.resolver ?? createCloudflareDohResolver(controlledFetch)
  const limit = kind === 'html' ? HTML_LIMIT : kind === 'css' ? CSS_LIMIT : LOGO_LIMIT
  try {
    if (input.length > 4096) throw new Error('Website URL exceeds the length limit')
    let url = new URL(input)
    url.hash = ''
    for (let hop = 0; hop <= 3; hop++) {
      await assertPublicSiteOrigin(url.toString(), resolver)
      const response = await controlledFetch(url.toString(), { headers: {
        'User-Agent': USER_AGENT,
        'Accept': kind === 'html' ? 'text/html,application/xhtml+xml' : kind === 'css' ? 'text/css' : 'image/svg+xml,image/png,image/jpeg,image/webp,image/gif'
      } })
      if (REDIRECTS.has(response.status)) {
        await response.body?.cancel()
        const location = response.headers.get('location')
        if (!location || hop === 3) throw new Error('Website redirect limit exceeded')
        url = new URL(location, url)
        url.hash = ''
        continue
      }
      const mimeType = (response.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase()
      const allowed = kind === 'html' ? ['text/html', 'application/xhtml+xml'] : kind === 'css' ? ['text/css'] : ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']
      if (!response.ok || !allowed.includes(mimeType)) {
        await response.body?.cancel()
        throw new Error('Website resource was unavailable or had an unsupported content type')
      }
      if (Number(response.headers.get('content-length')) > limit || !response.body) {
        await response.body?.cancel()
        throw new Error('Website resource exceeds the size limit')
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let length = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          length += value.byteLength
          if (length > limit) throw new Error('Website resource exceeds the size limit')
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => undefined) }
      if (!length) throw new Error('Website resource is empty')
      return { url: url.toString(), mimeType, bytes: Buffer.concat(chunks, length) }
    }
    throw new Error('Website redirect limit exceeded')
  } finally { clearTimeout(timer) }
}

function elements(node: Node): Element[] {
  const result: Element[] = []
  const visit = (current: Node) => {
    if ('tagName' in current) result.push(current)
    if ('childNodes' in current) for (const child of current.childNodes) visit(child)
  }
  visit(node)
  return result
}
const attribute = (node: Element, name: string) => node.attrs.find(attr => attr.name === name)?.value || ''
function text(node: Node): string {
  if ('value' in node) return node.value
  return 'childNodes' in node ? node.childNodes.map(text).join('') : ''
}
function absolute(input: string, base: string): string | undefined {
  try {
    const url = new URL(input, base)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    url.hash = ''
    return url.toString()
  } catch { return undefined }
}

/** CSS signals are suggestions, never fetched font binaries or a licensing assertion. */
export function readBrandCssSignals(css: string) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const fonts = new Map<string, { count: number, weights: Set<number> }>()
  const colors = new Map<string, number>()
  for (const block of clean.split('{').slice(1)) {
    const declarations = block.split('}', 1)[0]!
    const family = /(?:^|;)\s*font-family\s*:\s*([^;{}]+)/i.exec(declarations)?.[1]
    if (!family) continue
    const name = family.replace(/\s*!important\s*$/i, '').split(',')[0]!.trim().replace(/^(['"])(.*)\1$/, '$2')
    if (!name || name.length > 120 || /[()<>\\]/.test(name) || /^(inherit|initial|unset|serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-.+|-apple-system|BlinkMacSystemFont)$/i.test(name)) continue
    const weightValue = /(?:^|;)\s*font-weight\s*:\s*(\d{1,4}|normal|bold)(?=\s*(?:;|$))/i.exec(declarations)?.[1]
    const weight = weightValue === 'bold' ? 700 : weightValue === 'normal' ? 400 : Number(weightValue)
    const entry = fonts.get(name) || { count: 0, weights: new Set<number>() }
    entry.count++
    if (weight >= 1 && weight <= 1000) entry.weights.add(weight)
    fonts.set(name, entry)
  }
  // Read declaration values, not URL fragments or HTML/script text.
  for (const match of clean.matchAll(/(?:^|[;{])\s*(?:--[\w-]+|(?:background|border|outline)(?:-color)?|color|fill|stroke)\s*:\s*([^;}]+)/gi)) {
    const values = match[1]!.replace(/url\([^)]*\)/gi, '')
    for (const color of values.matchAll(/#([a-f\d]{6}|[a-f\d]{3})(?![a-f\d])/gi)) {
      const value = color[1]!.toLowerCase()
      const hex = '#' + (value.length === 3 ? [...value].map(ch => ch + ch).join('') : value)
      colors.set(hex, (colors.get(hex) || 0) + 1)
    }
    for (const color of values.matchAll(/\brgb\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)/gi)) {
      const channels = color.slice(1).map(Number)
      if (channels.some(channel => channel > 255)) continue
      const hex = '#' + channels.map(channel => channel.toString(16).padStart(2, '0')).join('')
      colors.set(hex, (colors.get(hex) || 0) + 1)
    }
  }
  return { fonts, colors }
}

export async function extractBrandWebsite(input: string, deps: BrandWebsiteDependencies = {}) {
  const page = await fetchBrandWebsiteResource(input, 'html', deps)
  const nodes = elements(parse(page.bytes.toString('utf8')))
  const meta = (name: string) => nodes.find(node => node.tagName === 'meta' && [attribute(node, 'property'), attribute(node, 'name')].includes(name))
  const title = text(nodes.find(node => node.tagName === 'title') || { nodeName: '#text', value: '' } as Node).trim().slice(0, 255)
  const brandName = attribute(meta('og:site_name') || { attrs: [] } as unknown as Element, 'content').trim().slice(0, 255)
  const themeColor = attribute(meta('theme-color') || { attrs: [] } as unknown as Element, 'content')
  const styles = nodes.flatMap(node => [node.tagName === 'style' ? text(node) : '', attribute(node, 'style') ? `inline{${attribute(node, 'style')}}` : '']).filter(Boolean)
  const queue: string[] = []
  let stylesheetLimitReached = false
  const enqueue = (value: string, base: string) => {
    const url = absolute(value, base)
    if (!url || queue.includes(url)) return
    if (queue.length >= MAX_STYLESHEETS) stylesheetLimitReached = true
    else queue.push(url)
  }
  for (const node of nodes) if (node.tagName === 'link' && attribute(node, 'rel').toLowerCase().split(/\s+/).includes('stylesheet')) enqueue(attribute(node, 'href'), page.url)
  const imports = (css: string, base: string) => {
    for (const match of css.matchAll(/@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)|"([^"]+)"|'([^']+)')/gi)) enqueue(match.slice(1).find(Boolean)!, base)
  }
  for (const style of styles) imports(style, page.url)
  const warnings = ['Website results are a draft. Review brand colours, font roles and logos before saving.', 'Font names and declared weights were detected; no font files were downloaded. Upload licensed files for custom fonts.']
  let stylesheetsRead = 0
  for (let i = 0; i < queue.length; i++) {
    try {
      const sheet = await fetchBrandWebsiteResource(queue[i]!, 'css', deps)
      const css = sheet.bytes.toString('utf8')
      styles.push(css)
      stylesheetsRead++
      imports(css, sheet.url)
    } catch { warnings.push('A stylesheet could not be safely read; some colours or fonts may be missing.') }
  }
  if (stylesheetLimitReached) warnings.push('Only the first four linked stylesheets were checked; review the draft for missing brand details.')
  const signals = readBrandCssSignals(styles.join('\n'))
  const fonts = [...signals.fonts].sort((a, b) => b[1].count - a[1].count).slice(0, 2).map(([family, signal], i) => ({
    role: i === 0 ? 'heading' : 'body', family, weights: signal.weights.size ? [...signal.weights].sort((a, b) => a - b) : [400]
  }))
  const logoCandidates: string[] = []
  for (const node of nodes) {
    const candidate = node.tagName === 'img' && /logo|brand|wordmark/i.test([attribute(node, 'src'), attribute(node, 'alt'), attribute(node, 'class'), attribute(node, 'id')].join(' '))
      ? attribute(node, 'src') || attribute(node, 'data-src')
      : node.tagName === 'link' && attribute(node, 'rel').toLowerCase().includes('apple-touch-icon') ? attribute(node, 'href') : ''
    const url = candidate ? absolute(candidate, page.url) : undefined
    if (url && !logoCandidates.includes(url) && logoCandidates.length < 3) logoCandidates.push(url)
  }
  if (!fonts.length) warnings.push('No font families were found in the readable page styles.')
  if (!logoCandidates.length) warnings.push('No logo image was detected. Upload the original logo file if needed.')
  return { url: page.url, title, brandName, themeColor, fonts, primaryColors: [...signals.colors].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([color]) => color), logoCandidates, warnings: [...new Set(warnings)], stylesheetsRead }
}

/** Reject active/external SVG content before mirroring it onto our asset origin. */
export async function fetchBrandWebsiteLogo(url: string, deps: BrandWebsiteDependencies = {}) {
  const resource = await fetchBrandWebsiteResource(url, 'logo', deps)
  return validateBrandLogoResource(resource)
}

/** Inkscape's editor state does not render. Remove only recognized metadata;
 * never discard an unknown namespace, active element or visible subtree. */
function stripSvgEditorMetadata(nodes: Element[], svg: Element) {
  const namespaces: Record<string, string> = {
    inkscape: 'http://www.inkscape.org/namespaces/inkscape',
    sodipodi: 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
    svg: 'http://www.w3.org/2000/svg',
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    cc: 'http://creativecommons.org/ns#',
    dc: 'http://purl.org/dc/elements/1.1/'
  }
  const declared = new Set(Object.keys(namespaces).filter(prefix => attribute(svg, `xmlns:${prefix}`) === namespaces[prefix]))
  const editorAttrs: Record<string, Set<string>> = {
    inkscape: new Set(['version', 'showpageshadow', 'pageopacity', 'pageshadow', 'pagecheckerboard', 'deskcolor', 'zoom', 'cx', 'cy', 'window-width', 'window-height', 'window-x', 'window-y', 'window-maximized', 'current-layer', 'label', 'groupmode', 'connector-curvature', 'export-filename', 'export-xdpi', 'export-ydpi']),
    sodipodi: new Set(['docname', 'nodetypes'])
  }
  for (const node of nodes) {
    node.attrs = node.attrs.filter((attr) => {
      if (attr.name === 'data-name') return false // Illustrator's nonrendering layer label.
      if (attr.name.startsWith('xmlns:') && Object.hasOwn(namespaces, attr.name.slice(6))) {
        if (attr.value !== namespaces[attr.name.slice(6)]) throw new Error('Unsupported SVG editor namespace')
        return false
      }
      const [prefix, name] = attr.name.split(':')
      if (prefix && editorAttrs[prefix]) {
        if (!declared.has(prefix) || !name || !editorAttrs[prefix].has(name)) throw new Error('Unsupported SVG editor attribute')
        return false
      }
      return true
    })
    if (node.tagName === 'metadata') {
      const childTags: Record<string, string[]> = { 'metadata': ['rdf:rdf'], 'rdf:rdf': ['cc:work'], 'cc:work': ['dc:format', 'dc:type', 'dc:title'], 'dc:format': [], 'dc:type': [], 'dc:title': [] }
      if (!['rdf', 'cc', 'dc'].every(prefix => declared.has(prefix))) throw new Error('Unsupported SVG metadata namespace')
      for (const entry of elements(node)) {
        const children = childTags[entry.tagName]
        if (!children || entry.childNodes.some(child => 'tagName' in child ? !children.includes(child.tagName) : !['dc:format', 'dc:title'].includes(entry.tagName) && !!text(child).trim())) throw new Error('Unsupported SVG metadata content')
        if (entry.attrs.some(attr => !(entry.tagName === 'metadata' && attr.name === 'id') && !(entry.tagName === 'cc:work' && attr.name === 'rdf:about' && attr.value === '') && !(entry.tagName === 'dc:type' && attr.name === 'rdf:resource' && attr.value === 'http://purl.org/dc/dcmitype/StillImage'))) throw new Error('Unsupported SVG metadata attribute')
        if (entry.tagName === 'dc:format' && text(entry).trim() !== 'image/svg+xml') throw new Error('Unsupported SVG metadata format')
      }
      const parent = node.parentNode
      if (parent && 'childNodes' in parent) parent.childNodes = parent.childNodes.filter(child => child !== node)
      continue
    }
    if (node.tagName !== 'sodipodi:namedview') continue
    if (!declared.has('sodipodi') || node.childNodes.some(child => 'tagName' in child || text(child).trim()) || node.attrs.some(attr => !['id', 'pagecolor', 'bordercolor', 'borderopacity', 'showgrid', 'objecttolerance', 'gridtolerance', 'guidetolerance'].includes(attr.name))) throw new Error('Unsupported SVG editor metadata')
    const parent = node.parentNode
    if (parent && 'childNodes' in parent) parent.childNodes = parent.childNodes.filter(child => child !== node)
  }
}

/** The accepted stylesheet grammar is class selectors and static paint only. */
function validateSvgPaintStyle(style: string, rootStyle = false, maskStyle = false) {
  if (style.length > 32768 || /[\\@{}]/.test(style)) throw new Error('Unsupported SVG logo styles')
  const properties = new Set(['fill', 'stroke', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'fill-rule', 'clip-rule', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'clip-path'])
  for (const declaration of style.split(';').filter(value => value.trim())) {
    const parts = declaration.split(':')
    const property = parts[0]?.trim().toLowerCase()
    const value = parts[1]?.trim() || ''
    if (parts.length !== 2 || !property || !value) throw new Error('Unsupported SVG logo styles')
    if (rootStyle && property === 'enable-background') {
      const coordinates = value.split(/\s+/)
      if (coordinates.shift() !== 'new' || coordinates.length !== 4 || coordinates.some(number => !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(number) || !Number.isFinite(Number(number)))) throw new Error('Unsupported SVG background geometry')
      continue
    }
    if (maskStyle && property === 'mask-type' && ['luminance', 'alpha'].includes(value)) continue
    if (!properties.has(property)) throw new Error('Unsupported SVG logo styles')
    const rgb = /^(?:rgb)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(value)
    if (['fill', 'stroke'].includes(property) && rgb && rgb.slice(1).every(channel => Number(channel) <= 255)) continue
    if (['fill', 'stroke', 'clip-path'].includes(property) && /^url\(\s*(["']?)#[\p{L}\p{N}\p{M}_-]+\1\s*\)$/iu.test(value)) continue
    if (!/^[-\w\s#.,%]+$/.test(value)) throw new Error('Unsupported SVG logo styles')
  }
}

function validateSvgClassRules(node: Element) {
  const css = text(node)
  if (css.length > 32768 || node.childNodes.some(child => 'tagName' in child) || /[\\@<>]/.test(css)) throw new Error('Unsupported SVG stylesheet')
  const rules = css.trim().split('}')
  if (rules.pop()?.trim() || rules.length > 512) throw new Error('Unsupported SVG stylesheet')
  for (const rule of rules) {
    const parts = rule.split('{')
    if (parts.length !== 2 || parts[0]!.split(',').some(selector => !/^\.[A-Za-z_][\w-]*$/.test(selector.trim()))) throw new Error('Unsupported SVG stylesheet selector')
    validateSvgPaintStyle(parts[1]!)
  }
}

/** Pure byte/content boundary, shared by authenticated provider imports. */
export function validateBrandLogoResource<T extends { bytes: Buffer, mimeType: string }>(resource: T): T {
  const bytes = resource.bytes
  const type = resource.mimeType
  if (!bytes.length || bytes.length > LOGO_LIMIT) throw new Error('Logo exceeds the size limit or is empty')
  if (!['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) throw new Error('Unsupported logo image type')
  if (type === 'image/svg+xml') {
    const source = bytes.toString('utf8')
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Unsupported SVG logo')
    const fragment = parseFragment(source)
    let nodes = elements(fragment)
    const allowed = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc', 'clipPath', 'mask', 'use', 'symbol', 'pattern', 'image', 'style'])
    const attributes = new Set(['xmlns', 'id', 'class', 'viewBox', 'width', 'height', 'preserveAspectRatio', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'gradientTransform', 'gradientUnits', 'offset', 'stop-color', 'stop-opacity', 'clip-path', 'clipPathUnits', 'clip-rule', 'mask', 'maskUnits', 'maskContentUnits', 'href', 'style', 'version', 'role', 'aria-hidden', 'aria-label', 'aria-labelledby', 'focusable'])
    const svg = nodes[0]
    if (!svg || svg.tagName !== 'svg' || fragment.childNodes.some(node => node !== svg && ('tagName' in node || text(node).trim()))) throw new Error('Invalid SVG logo')
    stripSvgEditorMetadata(nodes, svg)
    nodes = elements(svg)
    let embeddedBytes = 0
    for (const node of nodes) {
      if (!allowed.has(node.tagName)) throw new Error('Active SVG logos are not supported')
      if (node.tagName === 'style') validateSvgClassRules(node)
      for (const attr of node.attrs) {
        if (node.tagName === 'style' && attr.name === 'type' && attr.value === 'text/css') continue
        if (attr.name === 'xmlns' && attr.value !== 'http://www.w3.org/2000/svg') throw new Error('Unsupported SVG namespace')
        if (attr.prefix === 'xmlns' && attr.name === 'xlink' && attr.value === 'http://www.w3.org/1999/xlink') continue
        if (attr.prefix === 'xml' && attr.name === 'space' && ['preserve', 'default'].includes(attr.value)) continue
        if (node.tagName === 'pattern' && ['patternUnits', 'patternContentUnits'].includes(attr.name)) {
          if (!['objectBoundingBox', 'userSpaceOnUse'].includes(attr.value)) throw new Error('Unsupported SVG pattern units')
          continue
        }
        if (node.tagName === 'pattern' && attr.name === 'patternTransform') {
          const transforms = attr.value.trim().split(')')
          if (attr.value.length > 2048 || transforms.pop() !== '' || !transforms.length || transforms.length > 64 || transforms.some(value => !/^(?:matrix|translate|scale|rotate|skewX|skewY)\([-+\d.eE,\s]+$/.test(value.trim()))) throw new Error('Unsupported SVG pattern transform')
          continue
        }
        if (node.tagName === 'image' && attr.name === 'href' && attr.value.startsWith('data:')) {
          // Embedded images are raster bytes only. Never permit SVG, HTML, external
          // references, URL-encoded payloads or arbitrary data MIME types.
          const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(attr.value)
          if (!match || match[2]!.length % 4 !== 0 || match[2]!.length > Math.ceil(LOGO_LIMIT / 3) * 4) throw new Error('Unsupported embedded SVG image')
          const imageBytes = Buffer.from(match[2]!, 'base64')
          embeddedBytes += imageBytes.length
          if (embeddedBytes > LOGO_LIMIT || imageBytes.toString('base64') !== match[2]) throw new Error('Invalid or oversized embedded SVG image')
          validateBrandLogoResource({ bytes: imageBytes, mimeType: match[1]! })
          continue
        }
        if (!attributes.has(attr.name) || /[\\@]/.test(attr.value) || (attr.name === 'href' && !attr.value.startsWith('#')) || /url\(/i.test(attr.value.replace(/url\(\s*(["']?)#[\p{L}\p{N}\p{M}_-]+\1\s*\)/giu, ''))) throw new Error('External or active SVG logos are not supported')
        if (attr.name === 'style') validateSvgPaintStyle(attr.value, node === svg, node.tagName === 'mask')
      }
    }
    return { ...resource, bytes: Buffer.from(serializeOuter(svg)) }
  }
  const valid = type === 'image/png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : type === 'image/jpeg'
      ? bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : type === 'image/gif'
        ? ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
  if (!valid) throw new Error('Logo bytes do not match its image type')
  return resource
}
