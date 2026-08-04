import { extractNativeDocument } from './nativeParser'

const MAX_INPUT_BYTES = 25 * 1024 * 1024
const FILE_NAME_LIMIT = 500
const MIME_TYPE_LIMIT = 255

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store' }
  })
}

function failed(errorCode: string) {
  return {
    outcome: 'failed' as const,
    method: 'native' as const,
    blocks: [],
    metrics: { characters: 0, blankRatio: 1, replacementRatio: 0 },
    warnings: [],
    errorCode
  }
}

function decodedFileName(request: Request): string | null {
  const encoded = request.headers.get('x-document-file-name')
  if (!encoded || encoded.length > FILE_NAME_LIMIT * 3) return null
  try {
    const value = decodeURIComponent(encoded)
    return value.length <= FILE_NAME_LIMIT ? value : null
  } catch {
    return null
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/extract') return json({ error: 'not_found' }, 404)
    if (request.headers.get('content-type') !== 'application/octet-stream') {
      return json({ error: 'invalid_content_type' }, 415)
    }

    const fileName = decodedFileName(request)
    const mimeType = request.headers.get('x-document-mime-type')?.trim() || ''
    if (!fileName || !mimeType || mimeType.length > MIME_TYPE_LIMIT) {
      return json({ error: 'invalid_document_metadata' }, 400)
    }
    const declaredLength = Number(request.headers.get('content-length') || 0)
    if (Number.isFinite(declaredLength) && declaredLength > MAX_INPUT_BYTES) {
      return json(failed('DOCUMENT_SIZE_LIMIT'), 413)
    }

    const bytes = new Uint8Array(await request.arrayBuffer())
    if (bytes.byteLength > MAX_INPUT_BYTES) return json(failed('DOCUMENT_SIZE_LIMIT'), 413)

    try {
      return json(await extractNativeDocument({ bytes, fileName, mimeType }))
    } catch {
      return json(failed('DOCUMENT_PARSE_FAILED'))
    }
  }
}
