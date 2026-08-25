import type { QrStyle } from '~~/shared/qr/style'
import { renderQrSvg } from '~~/shared/qr/render-svg'

export interface QrCode {
  id: string
  client_id: string
  client_name?: string
  folder_id: string | null
  folder_name?: string | null
  code: string
  name: string
  destination_url: string
  style: QrStyle
  is_active: boolean
  scan_count: number
  last_scanned_at: string | null
  created_at: string
  updated_at: string
  short_url?: string
  sparkline?: number[]
  utm_enabled?: boolean
  utm_medium?: string
}

export interface QrFolder {
  id: string
  client_id: string
  name: string
  code_count: number
}

export const qrShortUrl = (code: string) => `https://app.xeroflow.io/q/${code}`

// PNG export is handled client-side (see downloadQrPng) — there is no server-side
// export.png endpoint, so this only ever produces the SVG export URL.
export const qrExportUrl = (id: string) => `/api/agency/qr-codes/${id}/export.svg`

/**
 * Renders a QR code's SVG client-side, rasterizes it through a canvas, and triggers
 * a PNG download. Used in place of a server-side export.png endpoint (not implemented).
 */
export async function downloadQrPng(code: { id: string, code: string, name: string, style: QrStyle }, size = 2048) {
  const svg = renderQrSvg({ text: qrShortUrl(code.code), style: code.style, size })
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' })
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    const img = new Image()
    img.width = size
    img.height = size
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Could not rasterize QR code'))
      img.src = svgUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(img, 0, 0, size, size)

    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Could not encode PNG')

    const pngUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = pngUrl
    a.download = `${code.name || code.code}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(pngUrl)
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

export function useQrCodes() {
  const base = '/api/agency/qr-codes'
  return {
    shortUrl: qrShortUrl,
    exportUrl: qrExportUrl,
    downloadPng: downloadQrPng,
    list: (params: { clientId?: string, folderId?: string, search?: string }) =>
      $fetch<{ codes: QrCode[] }>(base, { params }),
    get: (id: string) => $fetch<{ code: QrCode, shortUrl: string, history: any[] }>(`${base}/${id}`),
    create: (body: { name: string, clientId: string, folderId?: string | null, destinationUrl: string, style: QrStyle, utmEnabled?: boolean, utmMedium?: string }) =>
      $fetch<{ code: QrCode, shortUrl: string }>(base, { method: 'POST', body }),
    update: (id: string, body: Partial<{ name: string, folderId: string | null, destinationUrl: string, style: QrStyle, isActive: boolean, utmEnabled: boolean, utmMedium: string }>) =>
      $fetch<{ code: QrCode }>(`${base}/${id}`, { method: 'PATCH', body }),
    remove: (id: string) => $fetch(`${base}/${id}`, { method: 'DELETE' }),
    folders: (clientId: string) => $fetch<{ folders: QrFolder[] }>(`${base}/folders`, { params: { clientId } }),
    createFolder: (body: { clientId: string, name: string }) => $fetch<{ folder: QrFolder }>(`${base}/folders`, { method: 'POST', body }),
    renameFolder: (id: string, name: string) => $fetch(`${base}/folders/${id}`, { method: 'PATCH', body: { name } }),
    deleteFolder: (id: string) => $fetch(`${base}/folders/${id}`, { method: 'DELETE' }),
    uploadLogo: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return $fetch<{ dataUri: string }>(`${base}/logo`, { method: 'POST', body: fd })
    },
  }
}
