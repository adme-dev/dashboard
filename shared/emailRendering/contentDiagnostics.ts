import { parse, parseFragment } from 'parse5'
import { snapshotRenderInput, validateDocumentGraph } from './bounds'

/** Advisory inspection only. Never sanitizes, renders, fetches assets or changes send gates. */
export interface EmailDiagnosticReference {
  blockId?: string
  /** Existing edmHtmlEditables identifier, relative to the imported body/fragment. */
  regionId?: string
  field?: 'subject' | 'previewText' | 'language'
}

export type EmailDiagnosticCode = 'image_alt' | 'image_url' | 'action_url' | 'headings'
  | 'language' | 'subject' | 'preheader' | 'small_type' | 'low_contrast' | 'heavy_image' | 'inspection_limit'

export interface EmailContentDiagnostic {
  id: string
  code: EmailDiagnosticCode
  label: string
  status: 'warning'
  message: string
  reference?: EmailDiagnosticReference
  value?: number
}

export interface EmailDiagnosticImageAsset { url: string, fileSize: number }
export interface EmailContentDiagnosticInput {
  document?: unknown
  html?: string | null
  subject?: string | null
  previewText?: string | null
  /** Already stored, trusted asset metadata only; no remote size inference. */
  imageAssets?: readonly EmailDiagnosticImageAsset[]
}

export const EMAIL_DIAGNOSTIC_LIMITS = { htmlBytes: 1024 * 1024, nodes: 20000, depth: 100, issues: 200 } as const
const LABELS: Record<EmailDiagnosticCode, string> = {
  image_alt: 'Image description', image_url: 'Image source', action_url: 'Action link',
  headings: 'Headings', language: 'Document language', subject: 'Subject line', preheader: 'Preview text',
  small_type: 'Small typography', low_contrast: 'Text contrast', heavy_image: 'Image weight', inspection_limit: 'Inspection incomplete'
}
type Node = { nodeName: string, tagName?: string, value?: string, attrs?: { name: string, value: string }[], childNodes?: Node[] }
type Paint = { color?: string, background?: string, size?: number, weight?: string, uncertain?: boolean }
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const attrs = (node: Node) => Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]))
const skip = new Set(['head', 'style', 'script', 'noscript', 'template', 'svg', 'math', 'title'])

function hasReadableText(node: Node): boolean {
  const stack = [node]
  while (stack.length) {
    const item = stack.pop()!
    if (item.tagName && skip.has(item.tagName)) continue
    if (item.nodeName === '#text' && item.value?.trim()) return true
    for (const child of item.childNodes || []) stack.push(child)
  }
  return false
}

function opaqueColor(input?: string): number[] | null {
  const value = input?.trim().toLowerCase() || ''
  const named: Record<string, string> = { black: '#000000', white: '#ffffff' }
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(named[value] || value)
  if (match) {
    const full = match[1]!.length === 3 ? [...match[1]!].map(c => c + c).join('') : match[1]!
    return [0, 2, 4].map(offset => Number.parseInt(full.slice(offset, offset + 2), 16))
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value)
  if (!rgb) return null
  const channels = rgb.slice(1).map(Number)
  return channels.every(channel => channel <= 255) ? channels : null
}

function luminance(channels: number[]): number {
  const linear = channels.map((channel) => {
    const s = channel / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
}

function pixelSize(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined
  const match = /^(\d+(?:\.\d+)?)(px|pt)$/.exec(text(value).trim())
  return match ? Number(match[1]) * (match[2] === 'pt' ? 4 / 3 : 1) : undefined
}

function actionable(value: unknown): boolean {
  const url = text(value).trim()
  if (!url || url === '#') return false
  if (/^\{\{\s*[a-z_][a-z0-9_]*\s*\}\}$/i.test(url)) return true
  if (/^(mailto:[^\s]+|tel:[+\d]|#[^\s]+)/i.test(url)) return true
  try {
    const parsed = new URL(url)
    return ['https:', 'http:'].includes(parsed.protocol) && Boolean(parsed.hostname)
  } catch { return false }
}

/** Local advisory thresholds, not email-client or accessibility certification. */
export function diagnoseEmailContent(input: EmailContentDiagnosticInput): EmailContentDiagnostic[] {
  const issues: EmailContentDiagnostic[] = []
  const seen = new Set<string>()
  let incomplete = false
  let nodes = 0
  let remainingBytes = EMAIL_DIAGNOSTIC_LIMITS.htmlBytes as number
  let headings = 0
  let primaryHeadings = 0
  let firstHeading: EmailDiagnosticReference | undefined
  let language: string | undefined
  let importedBlockId: string | undefined
  let embeddedPreheader = false
  const assets = new Map((input.imageAssets || []).slice(0, 2048).map(asset => [asset.url, asset.fileSize]))
  const add = (code: EmailDiagnosticCode, message: string, reference?: EmailDiagnosticReference, value?: number) => {
    const id = [code, reference?.blockId || 'document', reference?.regionId || reference?.field || ''].join(':')
    if (seen.has(id)) return
    if (issues.length >= EMAIL_DIAGNOSTIC_LIMITS.issues - 1) {
      incomplete = true
      return
    }
    seen.add(id)
    issues.push({ id, code, label: LABELS[code], status: 'warning', message, ...(reference ? { reference } : {}), ...(value === undefined ? {} : { value }) })
  }
  const checkType = (paint: Paint, reference?: EmailDiagnosticReference) => {
    if (paint.uncertain) return
    if (paint.size && paint.size < 12) add('small_type', 'Text is smaller than 12px. Review readability on mobile.', reference, paint.size)
    const foreground = opaqueColor(paint.color)
    const background = opaqueColor(paint.background)
    if (!foreground || !background) return
    const a = luminance(foreground)
    const b = luminance(background)
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    const large = paint.size && (paint.size >= 24 || (paint.size >= 18.66 && /^(bold|[7-9]00)$/i.test(paint.weight || '')))
    if (ratio < (large ? 3 : 4.5)) add('low_contrast', 'Known solid text and background colours have low contrast. Review this text.', reference, Math.round(ratio * 100) / 100)
  }
  const image = (url: unknown, altPresent: boolean, decorative: boolean, ref: EmailDiagnosticReference) => {
    if (!text(url).trim()) add('image_url', 'Choose an image source before sending.', ref)
    // Explicit alt="" is legitimate decoration. Never invent a description.
    if (!altPresent && !decorative) add('image_alt', 'Add an image description, or explicitly mark the image as decorative with empty alt text.', ref)
    const bytes = assets.get(text(url))
    if (typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes > 500 * 1024) {
      add('heavy_image', 'Stored image size exceeds 500 KiB. Consider a lighter email asset.', ref, bytes)
    }
  }
  const heading = (level: number, ref: EmailDiagnosticReference) => {
    headings++
    if (level === 1) primaryHeadings++
    firstHeading ||= ref
  }

  const inspectHtml = (html: string, blockId?: string, full = false, inherited: Paint = {}) => {
    if (html.length > remainingBytes) {
      incomplete = true
      return
    }
    const bytes = new TextEncoder().encode(html).byteLength
    if (bytes > remainingBytes) {
      incomplete = true
      return
    }
    remainingBytes -= bytes
    const tree = (full ? parse(html, { scriptingEnabled: false }) : parseFragment(html, { scriptingEnabled: false })) as Node
    let stylesheet = false
    const scan = [tree]
    let scanned = 0
    while (scan.length) {
      const node = scan.pop()!
      if (++scanned > EMAIL_DIAGNOSTIC_LIMITS.nodes) {
        incomplete = true
        return
      }
      if (node.tagName === 'style' || (node.tagName === 'link' && /stylesheet/i.test(attrs(node).rel || ''))) stylesheet = true
      if (node.tagName === 'html' && full) language = attrs(node).lang || ''
      for (const child of node.childNodes || []) scan.push(child)
    }
    const htmlRoot = full ? tree.childNodes?.find(node => node.tagName === 'html') : undefined
    const body = htmlRoot?.childNodes?.find(node => node.tagName === 'body')
    const root = body || tree
    if (full && blockId) importedBlockId = blockId
    const visit = (node: Node, path: string, paint: Paint, depth: number, hidden: boolean) => {
      if (++nodes > EMAIL_DIAGNOSTIC_LIMITS.nodes || depth > EMAIL_DIAGNOSTIC_LIMITS.depth) {
        incomplete = true
        return
      }
      const tag = node.tagName
      if (tag && skip.has(tag)) return
      const a = attrs(node)
      const css = Object.fromEntries((a.style || '').split(';').flatMap((declaration) => {
        const colon = declaration.indexOf(':')
        return colon < 0 ? [] : [[declaration.slice(0, colon).trim().toLowerCase(), declaration.slice(colon + 1).trim().replace(/\s*!important$/i, '')]]
      }))
      const isHidden = hidden || a['aria-hidden'] === 'true' || a.hidden !== undefined || css.display === 'none' || css.visibility === 'hidden' || css['mso-hide'] === 'all'
      const next: Paint = {
        color: css.color || a.color || paint.color,
        background: css['background-color'] || a.bgcolor || paint.background,
        size: css['font-size'] ? pixelSize(css['font-size']) : (/^h[1-6]$/.test(tag || '') || a.size ? undefined : paint.size),
        weight: css['font-weight'] || (/^(?:h[1-6]|b|strong)$/.test(tag || '') ? 'bold' : paint.weight),
        // Never guess stylesheet cascade, alpha compositing, imagery or CSS shorthand.
        uncertain: paint.uncertain || stylesheet || Boolean(a.class || a.background || css.background || css['background-image'] || css.opacity || css.filter || css['mix-blend-mode'] || css.font || css.all)
      }
      const kind = tag === 'img' ? 'image' : tag === 'a' ? 'link' : 'text'
      const ref: EmailDiagnosticReference = { ...(blockId ? { blockId } : {}), regionId: `${kind}:${path}` }
      if (tag && !isHidden) {
        if (tag === 'img') image(a.src, Object.hasOwn(a, 'alt'), ['presentation', 'none'].includes(a.role || ''), ref)
        const backgroundImage = a.background || /url\(\s*['"]?([^'"()]+)['"]?\s*\)/i.exec(css['background-image'] || '')?.[1]
        if (tag !== 'img' && backgroundImage) image(backgroundImage, true, true, { ...ref, regionId: `image:${path}` })
        const anchorTarget = a.href === undefined && (a.id || a.name)
        if (tag === 'a' && !anchorTarget && !actionable(a.href)) add('action_url', 'Add a destination for this link or linked image; a placeholder is not actionable.', ref)
        if (/^h[1-6]$/.test(tag) && hasReadableText(node)) heading(Number(tag[1]), ref)
        if ((node.childNodes || []).some(child => child.nodeName === '#text' && child.value?.trim())) checkType(next, ref)
      }
      if (isHidden && /preheader|preview/i.test(`${a.class || ''} ${a.id || ''}`) && hasReadableText(node)) embeddedPreheader = true
      const counters = new Map<string, number>()
      for (const child of node.childNodes || []) {
        if (nodes >= EMAIL_DIAGNOSTIC_LIMITS.nodes) {
          incomplete = true
          break
        }
        const childTag = child.tagName
        const index = counters.get(childTag || '') || 0
        if (childTag) counters.set(childTag, index + 1)
        visit(child, childTag ? `${path ? `${path}/` : ''}${childTag}[${index}]` : path, next, depth + 1, isHidden)
      }
    }
    // Match the editor's body-relative paths: the synthetic root adds no segment.
    visit(root, '', inherited, 0, false)
  }

  if (input.document != null) {
    try {
      const document = snapshotRenderInput(input.document) as Record<string, { type: string, data: { childrenIds?: string[], props?: Record<string, unknown>, style?: Record<string, unknown> } }>
      validateDocumentGraph(document)
      // Structured compiler declares English; imported documents supply their own lang.
      language = 'en'
      const rootProps = document.root?.data.props || {}
      const visit = (id: string, paint: Paint, depth: number) => {
        if (++nodes > EMAIL_DIAGNOSTIC_LIMITS.nodes || depth > 32) {
          incomplete = true
          return
        }
        const block = document[id]
        if (!block) return
        const p = block.data.props || {}
        const s = block.data.style || {}
        const ref = { blockId: id }
        const next: Paint = { color: text(s.color) || paint.color, background: text(s.backgroundColor) || paint.background,
          size: pixelSize(s.fontSize) || paint.size, weight: text(s.fontWeight) || paint.weight,
          uncertain: paint.uncertain || Boolean(s.backgroundImage || (s.opacity != null && s.opacity !== 1) || s.boxShadow) }
        // Complete imports compile directly: the editor layout's canvas colour is
        // not a background in that email and must not make contrast look known.
        if (block.type === 'Html') inspectHtml(text(p.contents), id, p.documentMode === 'email', p.documentMode === 'email' ? {} : next)
        if (block.type === 'Text') inspectHtml(text(p.text), id, false, { ...next, color: text(s.color) || '#374151', size: pixelSize(s.fontSize) || 16, weight: text(s.fontWeight) || 'normal' })
        if (block.type === 'Heading') {
          const level = Number(text(p.level).replace('h', '')) || 2
          if (text(p.text).trim()) heading(level, ref)
          const size = [0, 32, 24, 20, 18, 16, 14][level] || 24
          checkType({ ...next, color: text(s.color) || '#111827', size: pixelSize(s.fontSize) || size, weight: 'bold' }, ref)
        }
        if (block.type === 'Image') {
          image(p.url, typeof p.alt === 'string', false, ref)
          // A mobile source is a second sent image with the same checks.
          const mobile = (block.data as { mobile?: { props?: Record<string, unknown> | null } | null }).mobile?.props
          if (typeof mobile?.url === 'string' && mobile.url) image(mobile.url, typeof (mobile.alt ?? p.alt) === 'string', false, ref)
          if (p.linkHref && !actionable(p.linkHref)) add('action_url', 'Add a destination for this linked image.', ref)
        }
        // Block background images are sent too; they are decorative by definition.
        if (typeof s.backgroundImage === 'string' && s.backgroundImage) image(s.backgroundImage, true, true, ref)
        if (block.type === 'Button') {
          if (!actionable(p.url)) add('action_url', 'Add a destination for this button.', ref)
          checkType({ ...next, color: text(p.buttonTextColor) || '#ffffff', background: text(p.buttonBackgroundColor) || undefined, size: pixelSize(s.fontSize) || 16 }, ref)
        }
        if (['hero-section', 'cta-banner'].includes(block.type)) {
          if (text(p.heading).trim()) heading(block.type === 'hero-section' ? 1 : 2, ref)
          if ((block.type === 'cta-banner' || p.ctaText) && !actionable(p.ctaUrl)) add('action_url', 'Add a destination for this call to action.', ref)
          if (p.imageUrl) image(p.imageUrl, true, true, ref)
        }
        if (block.type === 'Avatar') image(p.src, true, false, ref)
        if (block.type === 'header' && p.logoUrl) image(p.logoUrl, true, false, ref)
        if (block.type === 'testimonial' && p.avatarUrl) image(p.avatarUrl, true, true, ref)
        if (block.type === 'menu' && Array.isArray(p.items) && p.items.some(item => !actionable(item?.url))) add('action_url', 'Add destinations for the menu links.', ref)
        for (const child of block.data.childrenIds || []) visit(child, next, depth + 1)
        if (block.type === 'ColumnsContainer' && Array.isArray(p.columns)) {
          for (const column of p.columns as { childrenIds?: string[] }[]) for (const child of column.childrenIds || []) visit(child, next, depth + 1)
        }
      }
      visit('root', { color: text(rootProps.textColor), background: text(rootProps.canvasColor) }, 0)
    } catch { incomplete = true }
  } else if (input.html) inspectHtml(input.html, undefined, true)

  if (!headings && !incomplete) add('headings', 'No semantic headings were found. Add a heading to help readers navigate the email.', { blockId: importedBlockId || (input.document ? 'root' : undefined) })
  if (primaryHeadings > 1) add('headings', 'More than one top-level heading was found. Review the heading hierarchy.', firstHeading, primaryHeadings)
  if ((!language && !incomplete) || (language && !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(language))) add('language', 'Declare a valid email document language for assistive reading.', { field: 'language', ...(importedBlockId ? { blockId: importedBlockId } : {}) })
  const subject = text(input.subject).trim()
  const preview = text(input.previewText).trim()
  if (!subject) add('subject', 'Add a subject line before sending.', { field: 'subject' })
  else if ([...subject].length > 78) add('subject', 'Subject exceeds 78 characters and may be truncated in inboxes.', { field: 'subject' }, [...subject].length)
  if (!preview && !embeddedPreheader) add('preheader', 'Add preview text to control the inbox snippet.', { field: 'previewText' })
  else if ([...preview].length > 150) add('preheader', 'Preview text exceeds 150 characters and may be truncated.', { field: 'previewText' }, [...preview].length)
  else if (preview && preview.toLowerCase() === subject.toLowerCase()) add('preheader', 'Use preview text that adds to the subject instead of repeating it.', { field: 'previewText' })
  if (incomplete) issues.push({ id: 'inspection_limit:document', code: 'inspection_limit', label: LABELS.inspection_limit, status: 'warning', message: 'Some content exceeded the bounded inspection limits. Review it manually; these checks are incomplete.' })
  return issues
}
