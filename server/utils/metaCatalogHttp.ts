import { createError } from 'h3'
import { MetaCatalogProviderError } from '~~/server/utils/metaCatalogClient'

export function throwMetaCatalogHttpError(error: unknown, operation: 'read' | 'create' | 'rename' | 'delete'): never {
  if (!(error instanceof MetaCatalogProviderError)) throw error

  const dependencyHint = operation === 'delete' && error.httpStatus === 400
    ? ' Remove active feeds, product sets, shops, or ads that depend on this catalog in Meta, then retry.'
    : ''
  const statusCode = error.httpStatus && error.httpStatus >= 400 && error.httpStatus < 500
    ? error.httpStatus
    : 502

  throw createError({
    statusCode,
    statusMessage: `${error.message}${dependencyHint}`,
    data: {
      provider: 'meta',
      code: error.code,
      subcode: error.subcode,
      type: error.type,
      traceId: error.traceId,
    },
  })
}
