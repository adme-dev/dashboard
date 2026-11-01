import { createError, getHeader, getRequestWebStream, type H3Event } from 'h3'
import { DESIGN_ACTION_LIMITS } from '~~/shared/emailRendering/designActions'

const DEFAULT_APP_ORIGIN = 'https://app.xeroflow.io'
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;\s*charset\s*=\s*(?:"utf-8"|utf-8))?\s*$/i

function originUnavailable(): never {
  throw createError({ statusCode: 503, statusMessage: 'design_origin_unavailable' })
}
function originDenied(): never {
  throw createError({ statusCode: 403, statusMessage: 'design_origin_denied' })
}
function allowedOrigin(appOrigin: unknown): string {
  const configured = appOrigin === undefined ? DEFAULT_APP_ORIGIN : appOrigin
  if (
    typeof configured !== 'string'
    || !configured
    || configured.trim() !== configured
    // Inspect the raw shape before URL normalizes dot segments or backslashes.
    || !/^https?:\/\/[^\s/\\?#]+\/?$/i.test(configured)
  ) return originUnavailable()
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    return originUnavailable()
  }
  if (
    (url.protocol !== 'https:'
      && !(url.protocol === 'http:' && url.hostname === 'localhost'))
    || url.username
    || url.password
    || configured.includes('@')
    || url.pathname !== '/'
    || url.search
    || url.hash
    || url.href.includes('?')
    || url.href.includes('#')
  ) return originUnavailable()
  return url.origin
}

export function assertDesignMutationRequest(
  event: H3Event,
  appOrigin?: unknown
): void {
  const expectedOrigin = allowedOrigin(appOrigin)
  const fetchSite = getHeader(event, 'sec-fetch-site')
  if (fetchSite?.trim().toLowerCase() === 'cross-site') originDenied()
  const origin = getHeader(event, 'origin')
  if (origin !== undefined) {
    if (origin !== expectedOrigin) originDenied()
    try {
      if (new URL(origin).origin !== expectedOrigin) originDenied()
    } catch {
      originDenied()
    }
  }
  if (!JSON_CONTENT_TYPE.test(getHeader(event, 'content-type') ?? ''))
    throw createError({ statusCode: 415, statusMessage: 'json_required' })
}

export async function readBoundedJson(event: H3Event, maxBytes = DESIGN_ACTION_LIMITS.envelopeBytes): Promise<unknown> {
  const stream = getRequestWebStream(event)
  if (!stream)
    throw createError({ statusCode: 400, statusMessage: 'invalid_body' })
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let body = ''
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      bytes += item.value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw createError({
          statusCode: 413,
          statusMessage: 'design_request_too_large'
        })
      }
      body += decoder.decode(item.value, { stream: true })
    }
    body += decoder.decode()
    return JSON.parse(body)
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 400, statusMessage: 'invalid_body' })
  } finally {
    reader.releaseLock()
  }
}
