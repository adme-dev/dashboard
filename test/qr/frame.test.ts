import { describe, it, expect } from 'vitest'
import { renderQrSvg } from '../../shared/qr/render-svg'
import { QrStyleSchema } from '../../shared/qr/style'
import { QR_FRAME_STYLES, QrFrameSchema, defaultFrameLabel, framedDimensions, svgViewBox, wrapQrSvgWithFrame } from '../../shared/qr/frame'

const URL = 'https://app.xeroflow.io/q/AbC1234'
const style = QrStyleSchema.parse({ fg: '#123456' })
const inner = renderQrSvg({ text: URL, style })

describe('QrFrameSchema', () => {
  it('defaults to no frame and rejects bad colours / long labels', () => {
    expect(QrFrameSchema.parse({})).toMatchObject({ style: 'none', label: '', radius: 4, textColor: '#ffffff' })
    expect(() => QrFrameSchema.parse({ color: 'red' })).toThrow()
    expect(() => QrFrameSchema.parse({ label: 'x'.repeat(41) })).toThrow()
    expect(QrFrameSchema.parse({ label: '  Scan me  ' }).label).toBe('Scan me')
  })
  it('suggests a label from the hosted page template', () => {
    expect(defaultFrameLabel('competition')).toBe('Scan to enter')
    expect(defaultFrameLabel('subscribe')).toBe('Scan to subscribe')
    expect(defaultFrameLabel(null)).toBe('Scan me')
  })
})

describe('wrapQrSvgWithFrame', () => {
  it('returns the inner svg untouched for style none (resized when asked)', () => {
    expect(wrapQrSvgWithFrame({ inner, frame: { style: 'none' }, fg: style.fg })).toBe(inner)
    const sized = wrapQrSvgWithFrame({ inner, frame: null, fg: style.fg, size: 512 })
    expect(sized).toMatch(/^<svg[^>]*width="512" height="512"/)
    expect(svgViewBox(sized)).toEqual(svgViewBox(inner))
  })
  it('renders every style, nests the QR once and escapes the label', () => {
    for (const s of QR_FRAME_STYLES.filter(x => x !== 'none')) {
      const out = wrapQrSvgWithFrame({ inner, frame: { style: s, label: 'Scan & <win>' }, fg: style.fg })
      expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
      expect(out.match(/<svg/g)!.length).toBe(2)
      expect(out).toContain('Scan &amp; &lt;win&gt;')
      expect(out).not.toContain('<win>')
      const vb = svgViewBox(out)
      expect(vb.h).toBeGreaterThan(vb.w) // band or pill adds height
      expect(vb.w).toBeGreaterThan(svgViewBox(inner).w)
    }
  })
  it('uses the module colour unless the frame overrides it', () => {
    expect(wrapQrSvgWithFrame({ inner, frame: { style: 'label-below', label: 'Hi' }, fg: '#123456' })).toContain('fill="#123456"')
    expect(wrapQrSvgWithFrame({ inner, frame: { style: 'label-below', label: 'Hi', color: '#ff0000' }, fg: '#123456' })).toContain('rx="')
    expect(wrapQrSvgWithFrame({ inner, frame: { style: 'label-below', label: 'Hi', color: '#ff0000' }, fg: '#123456' }).split('fill="#ff0000"').length).toBeGreaterThan(1)
  })
  it('places the label above or below the code accordingly', () => {
    const below = wrapQrSvgWithFrame({ inner, frame: { style: 'label-below', label: 'Below' }, fg: style.fg })
    const above = wrapQrSvgWithFrame({ inner, frame: { style: 'label-above', label: 'Above' }, fg: style.fg })
    const qrY = (s: string) => Number(s.match(/<svg x="\d+" y="(\d+)"/)![1])
    expect(qrY(above)).toBeGreaterThan(qrY(below))
  })
  it('omits the band when there is no label but keeps the border', () => {
    const out = wrapQrSvgWithFrame({ inner, frame: { style: 'label-below', label: '' }, fg: style.fg })
    expect(out).not.toContain('<text')
    const vb = svgViewBox(out)
    expect(vb.h).toBe(vb.w)
  })
  it('scales output dimensions to the requested width', () => {
    const out = wrapQrSvgWithFrame({ inner, frame: { style: 'label-below', label: 'Scan' }, fg: style.fg, size: 1000 })
    const dims = framedDimensions(out, 1000)
    expect(out).toContain(`width="1000" height="${dims.height}"`)
    expect(dims.height).toBeGreaterThan(1000)
  })
})
