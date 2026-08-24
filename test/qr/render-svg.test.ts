import { describe, it, expect } from 'vitest'
import { buildMatrix } from '../../shared/qr/matrix'
import { renderQrSvg } from '../../shared/qr/render-svg'
import { QrStyleSchema, QR_PATTERNS, QR_EYES } from '../../shared/qr/style'

const URL = 'https://app.xeroflow.io/q/AbC1234'

describe('buildMatrix', () => {
  it('returns a square matrix with finder patterns', () => {
    const m = buildMatrix(URL, 'Q')
    expect(m.size).toBeGreaterThanOrEqual(21)
    expect(m.get(0, 0)).toBe(true)          // top-left finder outer ring
    expect(m.get(1, 1)).toBe(false)         // finder inner white ring
    expect(m.get(3, 3)).toBe(true)          // finder centre
  })
})

describe('renderQrSvg', () => {
  it('produces a self-contained svg with viewBox and background', () => {
    const svg = renderQrSvg({ text: URL, style: QrStyleSchema.parse({}) })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/)
    expect(svg).toContain('fill="#ffffff"')
  })
  it('renders every pattern/eye combination without throwing and they differ', () => {
    const outputs = new Set<string>()
    for (const pattern of QR_PATTERNS) for (const eye of QR_EYES) {
      const svg = renderQrSvg({ text: URL, style: QrStyleSchema.parse({ pattern, eye }) })
      expect(svg.length).toBeGreaterThan(500)
      outputs.add(svg)
    }
    expect(outputs.size).toBe(QR_PATTERNS.length * QR_EYES.length)
  })
  it('uses eyeFg for finder patterns when set', () => {
    const svg = renderQrSvg({ text: URL, style: QrStyleSchema.parse({ eyeFg: '#ff0000' }) })
    expect(svg).toContain('#ff0000')
  })
  it('embeds a logo as <image> and knocks out the centre', () => {
    const style = QrStyleSchema.parse({ logo: { dataUri: 'data:image/png;base64,iVBORw0KGgo=', sizePct: 20 } })
    const svg = renderQrSvg({ text: URL, style })
    expect(svg).toContain('<image')
    expect(svg).toContain('data:image/png;base64,iVBORw0KGgo=')
    const plain = renderQrSvg({ text: URL, style: QrStyleSchema.parse({}) })
    expect(svg).not.toEqual(plain)
  })
  it('is deterministic', () => {
    const a = renderQrSvg({ text: URL, style: QrStyleSchema.parse({ pattern: 'smooth' }) })
    const b = renderQrSvg({ text: URL, style: QrStyleSchema.parse({ pattern: 'smooth' }) })
    expect(a).toBe(b)
  })
})
