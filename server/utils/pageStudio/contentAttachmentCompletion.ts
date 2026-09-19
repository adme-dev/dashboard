import { createError } from 'h3'
import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { ContentAttachmentCompletionSchema, ContentAttachmentRequestSchema, contentAttachmentIdentity, requireMatchingContentAttachmentRequest } from '~~/shared/pageStudio/content-attachment'
import { withPageStudioContentAttachmentAuthority } from './contentAttachmentAuthority'

const Prepared = z.object({ request: ContentAttachmentRequestSchema, completion: ContentAttachmentCompletionSchema }).strict()
type Dependencies = Parameters<typeof withPageStudioContentAttachmentAuthority>[3] & {
  binding: { readContentAttachmentPreparation: (scope: unknown) => Promise<unknown> }
}
const denied = () => createError({ statusCode: 403, statusMessage: 'CMS completion could not be verified' })
const query = `SELECT metadata FROM page_studio_audit_events WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3
  AND action='content.attachment.completed' AND resource_type='content_attachment' AND resource_id=$4`
const args = (receipt: z.infer<typeof ContentAttachmentCompletionSchema>) => [receipt.scope.tenantId, receipt.scope.clientId, receipt.scope.siteId, receipt.operationId]
const same = (actual: unknown, expected: z.infer<typeof ContentAttachmentCompletionSchema>) => {
  const result = ContentAttachmentCompletionSchema.safeParse(actual)
  if (!result.success || JSON.stringify(result.data) !== JSON.stringify(expected)) throw denied()
  return result.data
}

/** The completion commit is the activation authority boundary. Provider I/O
 * finishes before entering the native transaction; expiry/logout fence its write. */
export async function commitPageStudioContentAttachment(input: unknown, environment: 'staging' | 'production', dependencies: Dependencies) {
  const request = await withPageStudioContentAttachmentAuthority(input, environment, (_db, request) => Promise.resolve(request), dependencies)
  const prepared = Prepared.parse(await dependencies.binding.readContentAttachmentPreparation(request.scope))
  requireMatchingContentAttachmentRequest(prepared.request, request)
  const receipt = prepared.completion
  if (receipt.identity !== await contentAttachmentIdentity(request) || receipt.operationId !== request.operationId
    || JSON.stringify(receipt.scope) !== JSON.stringify(request.scope)) throw denied()
  return withPageStudioContentAttachmentAuthority(request, environment, async (db) => {
    await db.query(`INSERT INTO page_studio_audit_events
      (tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
      VALUES($1,$2,$3,$5,$6,'content.attachment.completed','content_attachment',$4,$7,$8::jsonb)
      ON CONFLICT DO NOTHING`, [...args(receipt), request.actor.userId, request.actor.kind === 'agency-user' ? 'agency' : 'client',
      `cms.complete:${receipt.identity}`, JSON.stringify(receipt)])
    const rows = (await db.query<{ metadata: unknown }>(query, args(receipt))).rows
    if (rows.length !== 1) throw denied()
    return same(rows[0]!.metadata, receipt)
  }, dependencies)
}

/** A committed connection survives its initiating login ending. Every CMS access
 * still needs current native user/site permission and a non-disabled D1 route. */
export async function readPageStudioContentAttachmentCompletion(input: unknown, environment: 'staging' | 'production', dependencies: {
  read?: (sql: string, params: unknown[]) => Promise<{ metadata: unknown } | null>
} = {}) {
  const expected = ContentAttachmentCompletionSchema.parse(input)
  if (!['staging', 'production'].includes(environment) || expected.scope.environment !== environment) throw denied()
  const row = await (dependencies.read ?? queryOneFresh<{ metadata: unknown }>)(query, args(expected))
  return row ? same(row.metadata, expected) : null
}
