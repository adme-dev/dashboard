import { createError, defineEventHandler, getHeader, getRouterParam, readRawBody, type H3Event } from 'h3'
import {
  createDealerEvidenceService,
  DealerEvidenceError
} from '~~/server/utils/measurement/dealerEvidence'
import { createDefaultDealerEvidenceRepository } from '~~/server/utils/measurement/dealerEvidenceRepository'

const MAX_BODY_BYTES = 256 * 1024

async function resolveSecret(event: H3Event, reference: string) {
  const cloudflareEnv = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
  const value = cloudflareEnv?.[reference] ?? process.env[reference]
  const resolved = typeof value === 'object' && value !== null && 'get' in value
    && typeof (value as { get?: unknown }).get === 'function'
    ? await (value as { get(): Promise<unknown> }).get()
    : value
  return typeof resolved === 'string' && resolved.trim().length >= 16 ? resolved.trim() : null
}

export default defineEventHandler(async (event) => {
  const endpointKey = getRouterParam(event, 'endpointKey')
  if (!endpointKey || !/^[A-Za-z0-9_-]{32,128}$/.test(endpointKey)) {
    throw createError({ statusCode: 404, statusMessage: 'Endpoint unavailable' })
  }
  const rawBody = await readRawBody(event, 'utf8')
  if (rawBody === undefined || Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Payload rejected' })
  }
  const repository = createDefaultDealerEvidenceRepository(reference => resolveSecret(event, reference))
  const service = createDealerEvidenceService(repository)
  try {
    return await service.ingest({
      endpointKey,
      rawBody,
      headers: {
        timestamp: getHeader(event, 'x-xeroflow-timestamp') ?? undefined,
        nonce: getHeader(event, 'x-xeroflow-nonce') ?? undefined,
        signature: getHeader(event, 'x-xeroflow-signature') ?? undefined
      }
    })
  } catch (error) {
    if (error instanceof DealerEvidenceError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.statusCode >= 500 ? 'Evidence unavailable' : 'Evidence rejected',
        data: { code: error.code }
      })
    }
    throw error
  }
})
