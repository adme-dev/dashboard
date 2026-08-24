import { requireQrCodeAccess, shortUrl } from '~~/server/utils/qr/access'
import { renderQrSvg } from '~~/shared/qr/render-svg'
import { QrStyleSchema } from '~~/shared/qr/style'

export function exportFileBase(name: string, code: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'qr'}-${code}`
}

export default defineEventHandler(async (event) => {
  const { row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const style = QrStyleSchema.parse(row.style ?? {})
  const svg = renderQrSvg({ text: shortUrl(row.code), style })
  const inline = getQuery(event).inline === '1'
  setResponseHeaders(event, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${exportFileBase(row.name, row.code)}.svg"`,
  })
  return svg
})
