import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { resolveCustomerWorkspaceAccess } from './customerWorkspaces'
import { readCustomerSession, readCustomerSetup } from './customerSignup'
import { readCustomerEditorAuthority } from './customerEditorAuthority'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { issueCustomerEditorHandoff, parseCustomerEditorHandoffConfiguration } from './customerEditorHandoff'
import { assertSoleCmsAuthoringScope } from './cmsGraphCoordinator'
import { lockCmsContext, cmsEqual } from './cmsVisibility'
import { readManagedCmsAdoptionReceipt } from './cmsAdoption'
import { withVerifiedCustomerEditorStorage } from './customerEditorStorage'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

export interface CustomerEditorLaunchOptions {
  configuration: unknown
  env: Record<string, unknown>
  runTransaction?: RunPageStudioTransaction
}
const denied = () => createError({ statusCode: 409, statusMessage: 'Your editor is not available yet. Refresh your overview or contact support.' })
async function snapshot(db: PageStudioQueryClient, token: string, environment: 'staging' | 'production') {
  const run: RunPageStudioTransaction = work => work(db)
  const user = await readCustomerSession(token, run)
  const setup = await readCustomerSetup(token, run)
  if (!setup.workspaceId) throw denied()
  const site = (await db.query<{ site_id: string, entitlement_id: string }>(`SELECT receipt.site_id,site.entitlement_id FROM page_studio_customer_site_requests receipt
    JOIN page_studio_sites site ON site.id=receipt.site_id WHERE receipt.workspace_id=$1`, [setup.workspaceId])).rows[0]
  if (!site) throw denied()
  const authorityReceipt = { environment, entitlement_id: environment === 'production' ? site.entitlement_id : null,
    site_id: site.site_id, login_session_hash: await digestPortalSessionToken(token), purpose: 'editor' as const }
  const { identityId, owned } = await readCustomerEditorAuthority(db, authorityReceipt)
  if (identityId !== user.identityId) throw denied()
  if (owned.workspaceId !== setup.workspaceId) throw denied()
  const scope = owned.scope
  await assertSoleCmsAuthoringScope(db, scope)
  const context = await lockCmsContext(db, scope)
  const receipt = await readManagedCmsAdoptionReceipt(db, scope)
  const rows = (await db.query(`SELECT cp.id,cp.digest,cp.object_key FROM page_studio_sites site
    JOIN page_studio_checkpoints cp ON cp.tenant_id=site.tenant_id AND cp.client_id=site.client_id AND cp.site_id=site.id AND cp.id=site.current_checkpoint_id
    WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3`, [scope.tenantId, scope.clientId, scope.siteId])).rows
  const checkpoint = z.object({ id: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/), object_key: z.string() }).parse(rows.length === 1 ? rows[0] : null)
  if (!cmsEqual({ id: checkpoint.id, digest: checkpoint.digest }, context.application.manifest.checkpoint)) throw denied()
  // A lock wait must not extend native authority deadlines.
  await readCustomerSession(token, run)
  await readCustomerEditorAuthority(db, authorityReceipt)
  return { scope, context, checkpoint, receipt, identityId: user.identityId, workspaceId: owned.workspaceId }
}
async function verified<T>(token: string, options: CustomerEditorLaunchOptions, finish: (db: PageStudioQueryClient) => Promise<T>): Promise<T> {
  const config = parseCustomerEditorHandoffConfiguration(options.configuration)
  if (options.env.PAGE_STUDIO_CONTENT_ENVIRONMENT !== config.environment) throw denied()
  const run = options.runTransaction ?? transactionWithoutRetry
  return withVerifiedCustomerEditorStorage(db => snapshot(db, token, config.environment), { ...options, runTransaction: run }, finish)
}

/** Redacted, read-only availability; never mints a transport ticket or child JWT. */
export async function readCustomerEditorAvailability(token: string, options: CustomerEditorLaunchOptions) {
  try {
    return await verified(token, options, async () => true)
  } catch {
    // Storage/setup unavailability is redacted; native access loss must still
    // invalidate the earlier dashboard projection, including failed remote reads.
    await (options.runTransaction ?? transactionWithoutRetry)(async (db) => {
      const run: RunPageStudioTransaction = work => work(db)
      const setup = await readCustomerSetup(token, run)
      const user = await readCustomerSession(token, run)
      if (setup.workspaceId) {
        const access = await resolveCustomerWorkspaceAccess({ identityId: user.identityId, workspaceId: setup.workspaceId }, run)
        if (access.role !== 'owner' || access.legacyBinding) throw createError({ statusCode: 403 })
      }
      await readCustomerSession(token, run)
    })
    return false
  }
}
/** Explicit browser intent only. Final admission and ticket insertion share locks. */
export async function launchCustomerEditor(token: string, options: CustomerEditorLaunchOptions) {
  return await verified(token, options, db => issueCustomerEditorHandoff(token, options.configuration, { runTransaction: work => work(db) }))
}
