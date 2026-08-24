import { buildMatrix, type QrMatrix } from './matrix'
import type { QrStyle } from './style'

export interface RenderOptions { text: string, style: QrStyle, size?: number }

const MODULE = 10 // svg units per module

function isFinder(m: QrMatrix, r: number, c: number): boolean {
  const n = m.size
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)
}

function logoBox(m: QrMatrix, style: QrStyle): { r0: number, r1: number, c0: number, c1: number } | null {
  if (!style.logo) return null
  const modules = Math.round((m.size * style.logo.sizePct) / 100) + style.logo.padding * 2
  const start = Math.floor((m.size - modules) / 2)
  return { r0: start, r1: start + modules - 1, c0: start, c1: start + modules - 1 }
}

function inBox(b: ReturnType<typeof logoBox>, r: number, c: number) {
  return !!b && r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1
}

function moduleShape(style: QrStyle, m: QrMatrix, r: number, c: number, x: number, y: number): string {
  const s = MODULE
  switch (style.pattern) {
    case 'circles': return `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s * 0.42}"/>`
    case 'thin': { const i = s * 0.2; return `<rect x="${x + i}" y="${y + i}" width="${s - 2 * i}" height="${s - 2 * i}"/>` }
    case 'rounded': return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.3}"/>`
    case 'smooth': {
      // round only corners not touching an orthogonal neighbour → flowing blobs
      const up = m.get(r - 1, c), down = m.get(r + 1, c), left = m.get(r, c - 1), right = m.get(r, c + 1)
      const rr = s * 0.5
      const tl = !up && !left ? rr : 0, tr = !up && !right ? rr : 0
      const br = !down && !right ? rr : 0, bl = !down && !left ? rr : 0
      return `<path d="M${x + tl},${y} H${x + s - tr} ${tr ? `A${tr},${tr} 0 0 1 ${x + s},${y + tr}` : ''} V${y + s - br} ${br ? `A${br},${br} 0 0 1 ${x + s - br},${y + s}` : ''} H${x + bl} ${bl ? `A${bl},${bl} 0 0 1 ${x},${y + s - bl}` : ''} V${y + tl} ${tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : ''} Z"/>`
    }
    default: return `<rect x="${x}" y="${y}" width="${s}" height="${s}"/>`
  }
}

function eyeShape(style: QrStyle, x: number, y: number, fill: string, bg: string): string {
  const s = MODULE, outer = 7 * s, inner = 5 * s, core = 3 * s
  const rx = style.eye === 'circle' ? outer / 2 : style.eye === 'rounded' ? s * 1.5 : 0
  const rxi = style.eye === 'circle' ? inner / 2 : style.eye === 'rounded' ? s : 0
  const rxc = style.eye === 'circle' ? core / 2 : style.eye === 'rounded' ? s * 0.6 : 0
  return (
    `<rect x="${x}" y="${y}" width="${outer}" height="${outer}" rx="${rx}" fill="${fill}"/>` +
    `<rect x="${x + s}" y="${y + s}" width="${inner}" height="${inner}" rx="${rxi}" fill="${bg}"/>` +
    `<rect x="${x + 2 * s}" y="${y + 2 * s}" width="${core}" height="${core}" rx="${rxc}" fill="${fill}"/>`
  )
}

export function renderQrSvg({ text, style, size }: RenderOptions): string {
  const m = buildMatrix(text, style.logo ? 'H' : 'Q')
  const total = (m.size + style.margin * 2) * MODULE
  const off = style.margin * MODULE
  const box = logoBox(m, style)
  const eyeFill = style.eyeFg ?? style.fg
  const px = size ?? total

  let modules = ''
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) {
    if (!m.get(r, c) || isFinder(m, r, c) || inBox(box, r, c)) continue
    modules += moduleShape(style, m, r, c, off + c * MODULE, off + r * MODULE)
  }
  const n = m.size
  const eyes =
    eyeShape(style, off, off, eyeFill, style.bg) +
    eyeShape(style, off + (n - 7) * MODULE, off, eyeFill, style.bg) +
    eyeShape(style, off, off + (n - 7) * MODULE, eyeFill, style.bg)

  let logo = ''
  if (box && style.logo) {
    const pad = style.logo.padding * MODULE
    const x = off + box.c0 * MODULE + pad, y = off + box.r0 * MODULE + pad
    const w = (box.c1 - box.c0 + 1) * MODULE - 2 * pad
    logo = `<image href="${style.logo.dataUri}" x="${x}" y="${y}" width="${w}" height="${w}" preserveAspectRatio="xMidYMid meet"/>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="geometricPrecision">` +
    `<rect width="${total}" height="${total}" fill="${style.bg}"/>` +
    `<g fill="${style.fg}">${modules}</g>${eyes}${logo}</svg>`
}
