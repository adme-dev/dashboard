import type { H3Event } from 'h3'
import { getCachedObjectBinding } from '~~/server/utils/email'
import type {
  ExtractNativeDocumentInput,
  ExtractionBlock,
  NativeExtractionMetrics,
  NativeExtractionResult
} from '../../../workers/board-knowledge-extractor/src/nativeParser'

export type {
  ExtractNativeDocumentInput,
  ExtractionBlock,
  NativeExtractionLimits,
  NativeExtractionMetrics,
  NativeExtractionResult
} from '../../../workers/board-knowledge-extractor/src/nativeParser'

interface NativeExtractorBinding {
  fetch(request: Request): Promise<Response>
}

export interface ExtractNativeDocumentServiceInput extends ExtractNativeDocumentInput {
  event?: H3Event
}

function extractorBinding(event?: H3Event): NativeExtractorBinding | undefined {
  const binding = (event?.context as { cloudflare?: { env?: { BOARD_KNOWLEDGE_EXTRACTOR?: unknown } } } | undefined)
    ?.cloudflare?.env?.BOARD_KNOWLEDGE_EXTRACTOR
  if (binding && typeof binding === 'object' && 'fetch' in binding) return binding as NativeExtractorBinding
  return getCachedObjectBinding<NativeExtractorBinding>('BOARD_KNOWLEDGE_EXTRACTOR')
}

function failed(errorCode: string): NativeExtractionResult {
  return {
    outcome: 'failed',
    method: 'native',
    blocks: [],
    metrics: { characters: 0, blankRatio: 1, replacementRatio: 0 },
    warnings: [],
    errorCode
  }
}

function validBlock(value: unknown): value is ExtractionBlock {
  if (!value || typeof value !== 'object') return false
  const block = value as Record<string, unknown>
  if (!['text', 'table', 'heading'].includes(String(block.kind)) || typeof block.content !== 'string') return false
  if (block.content.length > 2_000_000) return false
  for (const key of ['heading', 'sheetName'] as const) {
    if (block[key] !== undefined && typeof block[key] !== 'string') return false
  }
  for (const key of ['pageStart', 'pageEnd', 'slideNumber'] as const) {
    if (block[key] !== undefined && (!Number.isInteger(block[key]) || Number(block[key]) < 1)) return false
  }
  return true
}

function validMetrics(value: unknown): value is NativeExtractionMetrics {
  if (!value || typeof value !== 'object') return false
  const metrics = value as Record<string, unknown>
  return ['characters', 'blankRatio', 'replacementRatio'].every(key => (
    typeof metrics[key] === 'number' && Number.isFinite(metrics[key]) && Number(metrics[key]) >= 0
  ))
}

function parseExtractorResponse(value: unknown): NativeExtractionResult | null {
  if (!value || typeof value !== 'object') return null
  const result = value as Record<string, unknown>
  if (!['usable', 'needs_ai', 'failed'].includes(String(result.outcome)) || result.method !== 'native') return null
  if (!Array.isArray(result.blocks) || result.blocks.length > 2_000 || !result.blocks.every(validBlock)) return null
  if (!validMetrics(result.metrics)) return null
  if (!Array.isArray(result.warnings)
    || result.warnings.length > 100
    || !result.warnings.every(warning => typeof warning === 'string' && warning.length <= 160)) return null
  if (result.errorCode !== null && typeof result.errorCode !== 'string') return null
  return result as unknown as NativeExtractionResult
}

/**
 * Native parsing lives in a private companion Worker in deployed environments so
 * pdfjs and SheetJS do not consume the Pages Worker release budget. Local Nuxt
 * development retains the same parser through a development-only dynamic import.
 */
export async function extractNativeDocument(input: ExtractNativeDocumentServiceInput): Promise<NativeExtractionResult> {
  const binding = extractorBinding(input.event)
  if (!binding) {
    if (import.meta.dev) {
      const local = await import('../../../workers/board-knowledge-extractor/src/nativeParser')
      return local.extractNativeDocument(input)
    }
    return failed('NATIVE_EXTRACTOR_UNAVAILABLE')
  }

  let response: Response
  try {
    const body = Uint8Array.from(input.bytes).buffer
    response = await binding.fetch(new Request('https://board-knowledge-extractor.internal/extract', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-document-file-name': encodeURIComponent(input.fileName),
        'x-document-mime-type': input.mimeType
      },
      body
    }))
  } catch {
    return failed('NATIVE_EXTRACTOR_UNAVAILABLE')
  }
  if (!response.ok) return failed(`NATIVE_EXTRACTOR_HTTP_${response.status}`)

  const parsed = parseExtractorResponse(await response.json().catch(() => null))
  return parsed || failed('NATIVE_EXTRACTOR_RESPONSE_INVALID')
}
