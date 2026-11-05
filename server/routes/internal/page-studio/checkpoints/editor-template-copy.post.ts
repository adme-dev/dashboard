import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { assertPageStudioSessionAuthority } from '~~/server/utils/pageStudio/sessionAuthority'
import { resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey, verifyPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'

/** Private launch admission proof. A ready destination does not inherit source
 * import permission, and its editor access survives catalogue withdrawal. */
export default eventHandler(async event => {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    if (!z.object({}).strict().safeParse(await readBody(event)).success) throw createError({ statusCode: 400 })
    const token = getHeader(event, 'x-page-studio-session')
    if (!token) throw createError({ statusCode: 401 })
    const claims = await verifyPageStudioSessionToken(token, resolvePageStudioSessionPublicKey(event), resolvePageStudioSessionEnvironment(event).issuer)
    // Preserve the existing source editing boundary; this proof adds no role.
    if (claims.role !== 'agency') throw createError({ statusCode: 403 })
    return await transactionWithoutRetry(async db => {
      await db.query('SELECT id FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR NO KEY UPDATE', [claims.tenantId, claims.clientId, claims.siteId])
      const authorize = async () => {
        await assertPageStudioSessionAuthority(claims, 'source:edit', { transaction: db })
        await assertPageStudioSessionAuthority(claims, 'workspace:checkpoint', { transaction: db })
      }
      await authorize()
      const row = (await db.query<{ checkpoint_id: string, object_key: string }>(`SELECT checkpoint.id AS checkpoint_id,checkpoint.object_key
        FROM page_studio_template_copies copy
        JOIN page_studio_sites site ON site.tenant_id=copy.tenant_id AND site.client_id=copy.client_id AND site.id=copy.site_id
        JOIN page_studio_checkpoints checkpoint ON checkpoint.tenant_id=site.tenant_id AND checkpoint.client_id=site.client_id
          AND checkpoint.site_id=site.id AND checkpoint.id=site.current_checkpoint_id
        JOIN page_studio_audit_events audit ON audit.tenant_id=checkpoint.tenant_id AND audit.client_id=checkpoint.client_id
          AND audit.site_id=checkpoint.site_id AND audit.resource_id=checkpoint.id AND audit.resource_type='checkpoint'
          AND audit.action='workspace.checkpointed' AND audit.idempotency_key='control:checkpoint:'||checkpoint.id
          AND audit.metadata->>'commitProtocol'='cas-v1' AND audit.metadata->>'digest'=checkpoint.digest
          AND audit.metadata->>'authorId'=checkpoint.author_id
        WHERE copy.tenant_id=$1 AND copy.client_id=$2 AND copy.site_id=$3 AND copy.state='ready'
          AND site.status IN ('draft','active') AND site.delivery_mode='static'
        FOR SHARE OF copy,checkpoint,audit`, [claims.tenantId, claims.clientId, claims.siteId])).rows[0]
      const ready = !!row && row.object_key === `tenants/${claims.tenantId}/clients/${claims.clientId}/sites/${claims.siteId}/checkpoints/${row.checkpoint_id}.json`
      await authorize()
      return { ready }
    })
  } catch (error) { return pageStudioInternalHttpError(event, error) }
})
