import { z } from 'zod'
import type { QrPageTemplate } from './page'

/**
 * CTA frames wrap a rendered QR SVG in an outer SVG with a coloured border and a
 * call-to-action label, so exports are print-ready without a designer pass.
 * Pure string work — safe on the server, in the browser and in tests.
 */
const HEX = /^#[0-9a-fA-F]{6}$/
export const QR_FRAME_STYLES = ['none', 'label-below', 'label-above', 'badge'] as const
export type QrFrameStyle = typeof QR_FRAME_STYLES[number]
export const QR_FRAME_LABEL_MAX = 40

export const QrFrameSchema = z.object({
  style: z.enum(QR_FRAME_STYLES).default('none'),
  label: z.string().trim().max(QR_FRAME_LABEL_MAX).default(''),
  /** Frame/band colour. Defaults to the code's module colour. */
  color: z.string().regex(HEX).optional(),
  /** Label text colour. Defaults to white. */
  textColor: z.string().regex(HEX).default('#ffffff'),
  /** Corner radius as a percentage of the QR side, 0 = square. */
  radius: z.number().min(0).max(12).default(4)
})
export type QrFrame = z.infer<typeof QrFrameSchema>
export const DEFAULT_FRAME: QrFrame = QrFrameSchema.parse({})

export const QR_FRAME_STYLE_LABELS: Record<QrFrameStyle, string> = {
  'none': 'No frame',
  'label-below': 'Label below',
  'label-above': 'Label above',
  'badge': 'Badge'
}

const LABEL_BY_TEMPLATE: Record<QrPageTemplate, string> = {
  lead: 'Scan to get in touch',
  interest: 'Scan to register',
  subscribe: 'Scan to subscribe',
  competition: 'Scan to enter'
}

/** Default CTA text for a code, by the hosted page template it points at (if any). */
export function defaultFrameLabel(template?: QrPageTemplate | null): string {
  return (template && LABEL_BY_TEMPLATE[template]) || 'Scan me'
}

export function escapeSvgText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Reads `viewBox="0 0 W H"` from an svg string. */
export function svgViewBox(svg: string): { w: number, h: number } {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  if (!m) throw new Error('svg has no viewBox')
  return { w: Number(m[1]), h: Number(m[2]) }
}

export interface FrameRenderOptions {
  /** Output of renderQrSvg (square, viewBox 0 0 T T). */
  inner: string
  frame: Partial<QrFrame> | null | undefined
  /** Module colour of the code — used when the frame has no explicit colour. */
  fg: string
  /** Output width in px. Height follows the frame's aspect ratio. Omit for viewBox units. */
  size?: number
}

/** Pixel dimensions of a framed render at a given width. */
export function framedDimensions(svg: string, width: number): { width: number, height: number } {
  const vb = svgViewBox(svg)
  return { width, height: Math.round(width * vb.h / vb.w) }
}

/**
 * Wraps an inner QR svg in a frame. `style: 'none'` returns the inner svg
 * (re-sized when `size` is given) so callers can always go through this function.
 */
export function wrapQrSvgWithFrame({ inner, frame: partial, fg, size }: FrameRenderOptions): string {
  const frame = QrFrameSchema.parse(partial ?? {})
  const { w: T } = svgViewBox(inner)
  const label = frame.label || ''
  const useFrame = frame.style !== 'none'
  if (!useFrame) return size ? resize(inner, size, size) : inner

  const color = frame.color ?? fg
  const border = Math.round(T * 0.05)
  const band = label ? Math.round(T * 0.2) : 0
  const rx = Math.round(T * frame.radius / 100)
  const outerW = T + border * 2
  const fontSize = Math.round(band * 0.46)
  const fontFamily = 'Helvetica Neue, Helvetica, Arial, sans-serif'
  const text = (x: number, y: number) => label
    ? `<text x="${x}" y="${y}" fill="${frame.textColor}" font-family="${fontFamily}" font-weight="700" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${escapeSvgText(label)}</text>`
    : ''

  let outerH: number
  let body: string
  if (frame.style === 'badge') {
    // Border only; the label sits in a pill straddling the bottom edge.
    const pillH = label ? Math.round(T * 0.14) : 0
    outerH = T + border * 2 + Math.round(pillH / 2)
    const pillW = Math.min(outerW - border * 2, Math.round(Math.max(label.length, 6) * fontSize * 0.62 + pillH))
    const pillX = Math.round((outerW - pillW) / 2)
    const pillY = T + border * 2 - Math.round(pillH / 2)
    body
      = `<rect width="${outerW}" height="${T + border * 2}" rx="${rx}" fill="${color}"/>`
        + place(inner, border, border, T)
        + (label
          ? `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="${color}"/>`
          + `<text x="${outerW / 2}" y="${pillY + pillH / 2}" fill="${frame.textColor}" font-family="${fontFamily}" font-weight="700" font-size="${Math.round(pillH * 0.5)}" text-anchor="middle" dominant-baseline="central">${escapeSvgText(label)}</text>`
          : '')
  } else {
    outerH = T + border * 2 + band
    const above = frame.style === 'label-above'
    const qrY = above ? border + band : border
    const bandY = above ? 0 : T + border * 2
    body
      = `<rect width="${outerW}" height="${outerH}" rx="${rx}" fill="${color}"/>`
        + place(inner, border, qrY, T)
        + text(outerW / 2, bandY + band / 2)
  }

  const px = size ? ` width="${size}" height="${Math.round(size * outerH / outerW)}"` : ` width="${outerW}" height="${outerH}"`
  return `<svg xmlns="http://www.w3.org/2000/svg"${px} viewBox="0 0 ${outerW} ${outerH}" shape-rendering="geometricPrecision">${body}</svg>`
}

/** Nest the inner svg at (x, y) with side T, dropping its own xmlns/width/height. */
function place(inner: string, x: number, y: number, T: number): string {
  return inner.replace(/^<svg[^>]*>/, (m) => {
    const vb = m.match(/viewBox="[^"]+"/)?.[0] ?? ''
    return `<svg x="${x}" y="${y}" width="${T}" height="${T}" ${vb}>`
  })
}

function resize(svg: string, w: number, h: number): string {
  return svg.replace(/^<svg([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '')} width="${w}" height="${h}">`)
}
