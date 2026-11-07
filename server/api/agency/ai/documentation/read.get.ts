import { getQuery } from 'h3'
import { createDocumentationReadHandler } from './read.post'

/** Public reference retrieval is a read, including for explicitly read-only staff. */
export function createDocumentationGetHandler(overrides: Parameters<typeof createDocumentationReadHandler>[0] = {}) {
  return createDocumentationReadHandler({ readBody: async event => getQuery(event), ...overrides })
}

export default createDocumentationGetHandler()
