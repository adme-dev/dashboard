import { requireQrCodeAccess, shortUrl } from '~~/server/utils/qr/access'
import { renderQrSvg } from '~~/shared/qr/render-svg'
import { QrStyleSchema } from '~~/shared/qr/style'
import { QR_FRAME_STYLES, QrFrameSchema, wrapQrSvgWithFrame, type QrFrameStyle } from '~~/shared/qr/frame'

export function exportFileBase(name: string, code: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'qr'}-${code}`
}

export default defineEventHandler(async (event) => {
  const { row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const style = QrStyleSchema.parse(row.style ?? {})
  const q = getQuery(event)
  // Stored frame, with one-off overrides: ?frame=label-below&label=Scan%20to%20enter
  const frameOverride = typeof q.frame === 'string' && (QR_FRAME_STYLES as readonly string[]).includes(q.frame) ? { style: q.frame as QrFrameStyle } : {}
  const labelOverride = typeof q.label === 'string' ? { label: q.label.slice(0, 40) } : {}
  const frameParsed = QrFrameSchema.safeParse({ ...(row.frame ?? {}), ...frameOverride, ...labelOverride })
  const frame = frameParsed.success ? frameParsed.data : QrFrameSchema.parse({})
  const svg = wrapQrSvgWithFrame({ inner: renderQrSvg({ text: shortUrl(row.code), style }), frame, fg: style.fg })
  const inline = q.inline === '1'
  setResponseHeaders(event, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${exportFileBase(row.name, row.code)}.svg"`
  })
  return svg
})
