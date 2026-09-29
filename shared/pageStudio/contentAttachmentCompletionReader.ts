import { ContentAttachmentCompletionSchema, type ContentAttachmentCompletion } from './content-attachment'

export type CompletionRead = (sql: string, params: unknown[]) => Promise<{ metadata: unknown } | null>
export const completionQuery = `SELECT metadata FROM page_studio_audit_events WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3
  AND action='content.attachment.completed' AND resource_type='content_attachment' AND resource_id=$4`
export const completionArgs = (receipt: ContentAttachmentCompletion) => [receipt.scope.tenantId, receipt.scope.clientId, receipt.scope.siteId, receipt.operationId]

export class ContentAttachmentCompletionDenied extends Error {
  readonly statusCode = 403
  constructor() { super('CMS completion could not be verified') }
}

export function requireMatchingCompletion(actual: unknown, expected: ContentAttachmentCompletion) {
  const result = ContentAttachmentCompletionSchema.safeParse(actual)
  if (!result.success || JSON.stringify(result.data) !== JSON.stringify(expected)) throw new ContentAttachmentCompletionDenied()
  return result.data
}

/** Read the native completion on every call. The caller supplies only a fresh,
 * environment-owned database reader; a prepared coordinator receipt is not authority. */
export async function readContentAttachmentCompletion(input: unknown, environment: 'staging' | 'production', read: CompletionRead) {
  const expected = ContentAttachmentCompletionSchema.parse(input)
  if (!['staging', 'production'].includes(environment) || expected.scope.environment !== environment) throw new ContentAttachmentCompletionDenied()
  const row = await read(completionQuery, completionArgs(expected))
  return row ? requireMatchingCompletion(row.metadata, expected) : null
}
