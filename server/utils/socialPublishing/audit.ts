import { execute } from '~~/server/utils/db'

export type SocialPublishingAuditAction
  = | 'post_created'
    | 'post_updated'
    | 'approval_requested'
    | 'post_approved'
    | 'post_rejected'
    | 'post_scheduled'
    | 'post_published'
    | 'account_disconnected'

export interface SocialPublishingAuditInput {
  clientId: string
  action: SocialPublishingAuditAction
  actorId?: string | null
  postId?: string | null
  socialAccountId?: string | null
  metadata?: Record<string, unknown>
}

const INSERT_SQL = `INSERT INTO social_publishing_audit_events (
  client_id, post_id, social_account_id, actor_id, action, metadata
) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`

export function socialPublishingAuditParams(input: SocialPublishingAuditInput): unknown[] {
  return [
    input.clientId,
    input.postId ?? null,
    input.socialAccountId ?? null,
    input.actorId ?? null,
    input.action,
    JSON.stringify(input.metadata ?? {})
  ]
}

export async function recordSocialPublishingAudit(
  input: SocialPublishingAuditInput,
  write: (sql: string, params?: unknown[]) => Promise<unknown> = execute
) {
  try {
    await write(INSERT_SQL, socialPublishingAuditParams(input))
  } catch (error) {
    console.error('[social-publishing-audit] failed to record event', error)
  }
}
