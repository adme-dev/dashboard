import { createError, getHeader, setHeader, type H3Event } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { TemplateCopyAttemptSchema, TemplateCopyRecoverySchema } from '~~/shared/pageStudio/templateCopyRecovery'
import { sameCodeContent } from '~~/shared/pageStudio/codeContent'
import { templateActorAuthorizer } from './templateCatalogueHttp'
import type { TemplateActor } from './templateCatalogue'
const identity = (actor: TemplateActor) => actor.kind === 'customer' ? actor.identityId : actor.userId
const account = (actor: TemplateActor) => actor.kind === 'customer' ? `customer:${actor.workspaceId}` : actor.kind === 'portal' ? `portal:${actor.tenantId}:${actor.clientId}` : `agency:${actor.tenantId}`
/** Stable across login renewal, bound to both account and authenticated identity. */
export function templateCopyRecoveryScope(actor: TemplateActor) {
  return digestPortalSessionToken(JSON.stringify(['template-copy-recovery-v1', account(actor), identity(actor)]))
}
export async function assertTemplateCopyRecoveryScope(event: H3Event, actor: TemplateActor) {
  if (getHeader(event, 'x-page-studio-copy-scope') !== await templateCopyRecoveryScope(actor)) {
    throw createError({ statusCode: 409, statusMessage: 'The copy account changed. Reload its recovery status before retrying.' })
  }
}
export async function templateCopyRecoveryHandler(event: H3Event, kind: TemplateActor['kind']) {
  setHeader(event, 'cache-control', 'private, no-store')
  const authorize = templateActorAuthorizer(event, kind)
  const actor = await authorize()
  const recoveryScope = await templateCopyRecoveryScope(actor)
  const items = await transactionWithoutRetry(async db => {
    const rows = (await db.query<{ requestId: string, versionId: string, siteId: string, status: 'preparing' | 'ready', payload: unknown }>(`
      SELECT copy.id AS "requestId", copy.version_id AS "versionId", copy.site_id AS "siteId", copy.state AS status, copy.request_payload AS payload
      FROM page_studio_template_copies copy
      WHERE copy.actor_kind=$1 AND copy.actor_id=$2 AND
        (copy.account_key=$3 OR ($1='agency' AND copy.account_key=$3||':'||copy.client_id::text))
        AND copy.state IN ('preparing','ready')
      ORDER BY CASE WHEN copy.state='preparing' THEN 0 ELSE 1 END, copy.created_at DESC, copy.id LIMIT 50`, [kind, identity(actor), account(actor)])).rows
    return rows.map(row => {
      const attempt = TemplateCopyAttemptSchema.parse({ ...row.payload as object, versionId: row.versionId })
      if (attempt.requestId !== row.requestId) throw createError({ statusCode: 409, statusMessage: 'Copy recovery identity is unavailable.' })
      return { attempt, siteId: row.siteId, status: row.status }
    })
  })
  if (!sameCodeContent(actor, await authorize())) throw createError({ statusCode: 403 })
  return TemplateCopyRecoverySchema.parse({ recoveryScope, items })
}
