import { verifyTypedTemplateSource } from '~~/shared/pageStudio/typedTemplate'
import { CodeContentBindingSchema, verifyCodePageImport } from '~~/shared/pageStudio/codeContent'
import type { PageStudioCheckpointCommitInput, PageStudioControlScope, PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import type { PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'

export class TemplateRegistrationError extends Error {
  constructor(readonly code: string, readonly statusCode: number) {
    super('Template registration is unavailable.')
    this.name = 'TemplateRegistrationError'
  }
}

interface SourceRow {
  id: string
  digest: string
  object_key: string
  etag: string
  author_id: string | null
  created_at: string | Date
  delivery_mode: string
}

/** The caller establishes agency mutation authority and exact source approval.
 * These locks bind a selected historical checkpoint, never the mutable head.
 * Audit identity, not the existence of private prepared bytes, proves acceptance. */
export async function readTemplateRegistrationSource(
  db: PageStudioQueryClient,
  scope: PageStudioControlScope,
  checkpointId: string,
  expectedDigest: string
): Promise<PageStudioCheckpointCommitInput> {
  const row = (await db.query<SourceRow>(`SELECT checkpoint.id, checkpoint.digest, checkpoint.object_key,
      checkpoint.etag, checkpoint.author_id, checkpoint.created_at, site.delivery_mode
    FROM page_studio_sites site JOIN page_studio_checkpoints checkpoint
      ON checkpoint.tenant_id=site.tenant_id AND checkpoint.client_id=site.client_id AND checkpoint.site_id=site.id
    WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3 AND checkpoint.id=$4
      AND site.status<>'archived'
    FOR SHARE OF site, checkpoint`, [scope.tenantId, scope.clientId, scope.siteId, checkpointId])).rows[0]
  if (!row) throw new TemplateRegistrationError('TEMPLATE_SOURCE_UNAVAILABLE', 404)
  if (row.digest !== expectedDigest) throw new TemplateRegistrationError('TEMPLATE_SOURCE_CONFLICT', 409)
  const audit = (await db.query<{ metadata: Record<string, unknown> }>(`SELECT metadata FROM page_studio_audit_events
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND action='workspace.checkpointed'
      AND resource_type='checkpoint' AND resource_id=$4 AND idempotency_key=$5
    FOR SHARE`, [scope.tenantId, scope.clientId, scope.siteId, checkpointId, `control:checkpoint:${checkpointId}`])).rows[0]
  if (!audit) throw new TemplateRegistrationError('TEMPLATE_SOURCE_INVALID', 422)
  if (row.delivery_mode !== 'static' || audit.metadata.commitProtocol !== 'cas-v1'
    || audit.metadata.digest !== row.digest || audit.metadata.authorId !== row.author_id
    || (typeof audit.metadata.expectedCheckpointId !== 'string' && audit.metadata.expectedCheckpointId !== null) || !row.author_id) {
    throw new TemplateRegistrationError('TEMPLATE_SOURCE_INVALID', 422)
  }
  const binding = audit.metadata.codeContent == null ? null : CodeContentBindingSchema.safeParse(audit.metadata.codeContent)
  if (binding && !binding.success) throw new TemplateRegistrationError('TEMPLATE_SOURCE_INVALID', 422)
  return {
    checkpoint: { scope: { ...scope }, checkpointId: row.id, digest: row.digest,
      objectKey: row.object_key, etag: row.etag, userId: row.author_id,
      createdAt: new Date(row.created_at).toISOString(), ...(binding?.success ? { codeContent: binding.data } : {}) },
    expectedCheckpointId: audit.metadata.expectedCheckpointId
  }
}

/** Storage is read-only and bounded by the existing import verifier. Never
 * accept a caller-supplied package, inventory, object key or review receipt. */
export async function verifyTemplateRegistrationSource(
  source: PageStudioCheckpointCommitInput,
  bucket: PageStudioCheckpointBucket
) {
  try {
    return source.checkpoint.codeContent
      ? { ...await verifyCodePageImport(source, bucket), format: 'code-pages' as const }
      : await verifyTypedTemplateSource(source, bucket)
  } catch {
    throw new TemplateRegistrationError('TEMPLATE_SOURCE_INVALID', 422)
  }
}
