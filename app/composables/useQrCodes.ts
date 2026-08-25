import type { QrStyle } from '~~/shared/qr/style'
import { renderQrSvg } from '~~/shared/qr/render-svg'
import { framedDimensions, wrapQrSvgWithFrame, type QrFrame } from '~~/shared/qr/frame'
import type { BulkQrInput } from '~~/shared/qr/bulk'
import type { QrAb } from '~~/shared/qr/ab'
import { idempotencyKey } from '~~/app/utils/idempotencyKey'
import type { QrPageConfig, QrPageTemplate } from '~~/shared/qr/page'

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
  frame?: Partial<QrFrame> | null
  ab?: Partial<QrAb> | null
  campaign_id?: string | null
  campaign_name?: string | null
  is_active: boolean
  scan_count: number
  last_scanned_at: string | null
  created_at: string
  updated_at: string
  short_url?: string
  sparkline?: number[]
  utm_enabled?: boolean
  utm_medium?: string
  utm_source?: string | null
  destination_mode?: 'url' | 'page'
}

export interface QrPage {
  id: string
  qr_code_id: string
  template: QrPageTemplate
  config: QrPageConfig
  competition_id: string | null
  is_published: boolean
  published_at: string | null
  submissions_count: number
  updated_at: string
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
/** Framed SVG markup for a code at a given width (used by both exports). */
export function renderQrSvgForExport(code: { code: string, style: QrStyle, frame?: Partial<QrFrame> | null }, size?: number) {
  return wrapQrSvgWithFrame({ inner: renderQrSvg({ text: qrShortUrl(code.code), style: code.style }), frame: code.frame, fg: code.style.fg, size })
}

/** Rasterises a code (with its frame) through a canvas and returns a PNG blob. */
export async function renderQrPngBlob(code: { code: string, style: QrStyle, frame?: Partial<QrFrame> | null }, size = 2048): Promise<Blob> {
  const svg = renderQrSvgForExport(code, size)
  const { width, height } = framedDimensions(svg, size)
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' })
  const svgUrl = URL.createObjectURL(svgBlob)
  try {
    const img = new Image()
    img.width = width
    img.height = height
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Could not rasterize QR code'))
      img.src = svgUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(img, 0, 0, width, height)
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Could not encode PNG')
    return blob
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Renders a QR code's SVG client-side, rasterizes it through a canvas, and triggers
 * a PNG download. Used in place of a server-side export.png endpoint (not implemented).
 */
export async function downloadQrPng(code: { id: string, code: string, name: string, style: QrStyle, frame?: Partial<QrFrame> | null }, size = 2048) {
  triggerDownload(await renderQrPngBlob(code, size), `${code.name || code.code}.png`)
}

export function useQrCodes() {
  const base = '/api/agency/qr-codes'
  // Owners' writes run under the God-mode execution ledger, which needs a stable Idempotency-Key per attempt.
  const idem = (scope: string) => ({ 'Idempotency-Key': idempotencyKey(`qr-${scope}`) })
  return {
    shortUrl: qrShortUrl,
    exportUrl: qrExportUrl,
    downloadPng: downloadQrPng,
    list: (params: { clientId?: string, folderId?: string, campaignId?: string, search?: string }) =>
      $fetch<{ codes: QrCode[] }>(base, { params }),
    get: (id: string) => $fetch<{ code: QrCode, shortUrl: string, history: any[] }>(`${base}/${id}`),
    create: (body: { name: string, clientId: string, folderId?: string | null, destinationUrl: string, style: QrStyle, frame?: QrFrame, utmEnabled?: boolean, utmMedium?: string, utmSource?: string | null }) =>
      $fetch<{ code: QrCode, shortUrl: string }>(base, { method: 'POST', body, headers: idem('create') }),
    update: (id: string, body: Partial<{ name: string, folderId: string | null, destinationUrl: string, style: QrStyle, frame: QrFrame, ab: QrAb, isActive: boolean, utmEnabled: boolean, utmMedium: string, utmSource: string | null }>) =>
      $fetch<{ code: QrCode }>(`${base}/${id}`, { method: 'PATCH', body, headers: idem(`update:${id}`) }),
    bulkCreate: (body: BulkQrInput) => $fetch<{ campaignId: string, codes: QrCode[] }>(`${base}/bulk`, { method: 'POST', body, headers: idem('bulk-create') }),
    campaigns: (clientId?: string) => $fetch<{ campaigns: any[] }>('/api/agency/qr-campaigns', { params: clientId ? { clientId } : {} }),
    campaign: (id: string) => $fetch<{ campaign: any, codes: QrCode[], totals: { scans: number, visitors: number, leads: number } }>(`/api/agency/qr-campaigns/${id}`),
    remove: (id: string) => $fetch(`${base}/${id}`, { method: 'DELETE', headers: idem(`delete:${id}`) }),
    folders: (clientId: string) => $fetch<{ folders: QrFolder[] }>(`${base}/folders`, { params: { clientId } }),
    createFolder: (body: { clientId: string, name: string }) => $fetch<{ folder: QrFolder }>(`${base}/folders`, { method: 'POST', body, headers: idem('folder-create') }),
    renameFolder: (id: string, name: string) => $fetch(`${base}/folders/${id}`, { method: 'PATCH', body: { name }, headers: idem(`folder-update:${id}`) }),
    deleteFolder: (id: string) => $fetch(`${base}/folders/${id}`, { method: 'DELETE', headers: idem(`folder-delete:${id}`) }),
    page: (id: string) => $fetch<{ page: QrPage | null, draft?: { template: QrPageTemplate, config: QrPageConfig } }>(`${base}/${id}/page`),
    savePage: (id: string, body: { template: QrPageTemplate, config: QrPageConfig, destinationMode?: 'url' | 'page', competitionId?: string | null }) =>
      $fetch<{ page: QrPage }>(`${base}/${id}/page`, { method: 'PUT', body, headers: idem(`page-save:${id}`) }),
    publishPage: (id: string, published: boolean) =>
      $fetch<{ page: QrPage }>(`${base}/${id}/page/publish`, { method: 'POST', body: { published }, headers: idem(`page-publish:${id}`) }),
    uploadPageAsset: (id: string, file: File, kind: 'hero' | 'logo') => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      return $fetch<{ asset: { id: string, kind: string, url: string } }>(`${base}/${id}/page/assets`, { method: 'POST', body: fd, headers: idem(`page-asset:${id}`) })
    },
    previewPageUrl: (code: string) => `/q/${code}?xf_preview=1`,
    competitions: (clientId?: string) => $fetch<{ competitions: any[] }>('/api/agency/qr-competitions', { params: clientId ? { clientId } : {} }),
    competition: (id: string): Promise<any> => $fetch(`/api/agency/qr-competitions/${id}` as string),
    createCompetition: (body: Record<string, unknown>) => $fetch<{ competition: any }>('/api/agency/qr-competitions', { method: 'POST', body, headers: idem('comp-create') }),
    updateCompetition: (id: string, body: Record<string, unknown>) => $fetch<{ competition: any }>(`/api/agency/qr-competitions/${id}`, { method: 'PATCH', body, headers: idem(`comp-update:${id}`) }),
    competitionEntries: (id: string) => $fetch<{ entries: any[] }>(`/api/agency/qr-competitions/${id}/entries`),
    drawCompetition: (id: string, body: { winners?: number, reserves?: number, note?: string }) => $fetch<{ draw: any }>(`/api/agency/qr-competitions/${id}/draw`, { method: 'POST', body, headers: idem(`comp-draw:${id}`) }),
    uploadCompetitionDocument: (id: string, file: File, kind: string, title: string, state?: string) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      fd.append('title', title)
      if (state) fd.append('state', state)
      return $fetch<{ document: any }>(`/api/agency/qr-competitions/${id}/documents`, { method: 'POST', body: fd, headers: idem(`comp-doc:${id}`) })
    },
    deleteCompetitionDocument: (id: string, docId: string, reason: string) => $fetch(`/api/agency/qr-competitions/${id}/documents/${docId}`, { method: 'DELETE', body: { reason }, headers: idem(`comp-doc-del:${docId}`) }),
    uploadLogo: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return $fetch<{ dataUri: string }>(`${base}/logo`, { method: 'POST', body: fd, headers: idem('logo') })
    }
  }
}
