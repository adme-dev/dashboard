import { createError, getHeader, readRawBody, type H3Event } from 'h3'

// Match the existing 100 MiB asset cap, with bounded multipart headers/fields.
export const MAX_BANNER_MULTIPART_BYTES = 100 * 1024 * 1024 + 32 * 1024
interface BannerMultipartPart { name: string, filename?: string, type?: string, data: Buffer }
const invalid = () => createError({ statusCode: 400, statusMessage: 'Invalid banner upload form' })

/** Binary views avoid h3's per-byte number arrays and payload-sized array slices. */
export function parseBannerMultipart(raw: Buffer, contentType: string): BannerMultipartPart[] {
  if (raw.length > MAX_BANNER_MULTIPART_BYTES) throw createError({ statusCode: 413, statusMessage: 'Banner upload is too large' })
  const match = /^multipart\/form-data\s*;\s*boundary=(?:"([^"\r\n]+)"|([^;\s]+))\s*$/i.exec(contentType)
  const boundary = match?.[1] || match?.[2]
  if (!boundary || !/^[\x21-\x7e]{1,70}$/.test(boundary)) throw invalid()
  const opening = Buffer.from(`--${boundary}\r\n`)
  if (!raw.subarray(0, opening.length).equals(opening)) throw invalid()
  const delimiter = Buffer.from(`\r\n--${boundary}`)
  const parts: BannerMultipartPart[] = []
  let cursor = opening.length
  while (parts.length < 8) {
    const headerEnd = raw.indexOf('\r\n\r\n', cursor)
    if (headerEnd < cursor || headerEnd - cursor > 8192) throw invalid()
    const headers = new Map<string, string>()
    for (const line of raw.subarray(cursor, headerEnd).toString('utf8').split('\r\n')) {
      const colon = line.indexOf(':')
      if (colon <= 0) throw invalid()
      const name = line.slice(0, colon).trim().toLowerCase()
      if (headers.has(name)) throw invalid()
      headers.set(name, line.slice(colon + 1).trim())
    }
    const disposition = headers.get('content-disposition') || ''
    const names = [...disposition.matchAll(/(?:^|;\s*)name="([^"\r\n]*)"(?=;|$)/gi)]
    const filenames = [...disposition.matchAll(/(?:^|;\s*)filename="([^"\r\n]*)"(?=;|$)/gi)]
    if (names.length !== 1 || filenames.length > 1) throw invalid()
    const name = names[0]?.[1]
    const filename = filenames[0]?.[1]
    if (!/^form-data\s*;/i.test(disposition) || !name || name.length > 100 || (filename?.length || 0) > 1000) throw invalid()
    const start = headerEnd + 4
    let end = raw.indexOf(delimiter, start)
    let closing = false
    while (end >= 0) {
      const suffix = end + delimiter.length
      const next = raw.subarray(suffix, suffix + 2).toString('latin1')
      if (next === '\r\n') break
      if (next === '--' && (suffix + 2 === raw.length || raw.subarray(suffix + 2).equals(Buffer.from('\r\n')))) {
        closing = true
        break
      }
      end = raw.indexOf(delimiter, end + 1)
    }
    if (end < start) throw invalid()
    parts.push({ name, ...(filename !== undefined ? { filename } : {}), ...(headers.has('content-type') ? { type: headers.get('content-type') } : {}), data: raw.subarray(start, end) })
    if (closing) return parts
    cursor = end + delimiter.length + 2
  }
  throw invalid()
}

export async function readBannerMultipart(event: H3Event): Promise<BannerMultipartPart[]> {
  const length = Number(getHeader(event, 'content-length'))
  if (length > MAX_BANNER_MULTIPART_BYTES) throw createError({ statusCode: 413, statusMessage: 'Banner upload is too large' })
  const contentType = getHeader(event, 'content-type') || ''
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw invalid()
  const raw = await readRawBody(event, false)
  if (!raw) throw invalid()
  return parseBannerMultipart(raw, contentType)
}
