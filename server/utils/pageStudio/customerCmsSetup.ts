import { createError, type H3Event } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { CustomerCmsSetupRequestSchema, CustomerCmsSetupStatusSchema, CustomerCmsAdoptionStatusSchema } from '~~/shared/pageStudio/customerCmsSetup'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { readCustomerSession, readCustomerSetup } from './customerSignup'
import { readCustomerSessionIdentityFromHash, readCustomerProvisioningPreviewAuthority, verifyCustomerProvisioningAuthority } from './customerProvisioning'
import { PageStudioProvisioningJobSchema, readPageStudioProvisioning, type PageStudioProvisionerBinding } from './provisioningBinding'
import { assertCustomerCmsSetupApproval } from './customerCmsSetupAuthority'
import { issueCustomerCmsSetupHandoff, parseCustomerEditorHandoffConfiguration } from './customerEditorHandoff'
import { exchangeCustomerEditorSession, assertCustomerEditorSessionAuthority } from './customerEditorSessions'
import { CustomerEditorClaimsSchema, type CustomerEditorClaims } from './customerEditorToken'
import { coordinateCustomerSchemaUpgrade } from './customerSchemaUpgrade'
import { coordinateCmsAdoption } from './cmsAdoptionCoordinator'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

export interface CustomerCmsSetupOptions {
  configuration: unknown
  env: Record<string, unknown>
  event?: H3Event
  runTransaction?: RunPageStudioTransaction
  signToken?: (claims: CustomerEditorClaims) => Promise<string>
}
const denied = () => createError({ statusCode: 403, statusMessage: 'Customer CMS setup is not available.' })
const resume = () => createError({ statusCode: 409, statusMessage: 'Resume CMS setup before continuing.' })
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
const kinds = ['collection', 'workflow', 'collection-staging', 'form-runtime', 'form-drafts'] as const
function configuration(options: CustomerCmsSetupOptions) {
  if (options.env.PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED !== 'true'
    || options.env.PAGE_STUDIO_CONTENT_ENVIRONMENT !== 'staging'
    || options.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'staging') throw denied()
  return parseCustomerEditorHandoffConfiguration(options.configuration)
}
async function ownerContext(db: PageStudioQueryClient, token: string) {
  const run: RunPageStudioTransaction = work => work(db)
  const user = await readCustomerSession(token, run), setup = await readCustomerSetup(token, run)
  if (!setup.workspaceId) throw denied()
  const site = (await db.query<{ site_id: string }>('SELECT site_id FROM page_studio_customer_site_requests WHERE workspace_id=$1', [setup.workspaceId])).rows[0]
  if (!site) throw denied()
  const owned = await readCustomerProvisioningPreviewAuthority(db, site.site_id, user.identityId)
  if (owned.workspaceId !== setup.workspaceId) throw denied()
  await readCustomerSession(token, run)
  return { owned, userId: user.identityId }
}
async function context(db: PageStudioQueryClient, token: string) {
  const { owned, userId } = await ownerContext(db, token)
  const run: RunPageStudioTransaction = work => work(db)
  const approval = await assertCustomerCmsSetupApproval(db, owned, userId)
  const saved = (await db.query<{ job: unknown }>(`SELECT job FROM page_studio_customer_provisioning_intents
    WHERE site_id=$1 AND workspace_id=$2 AND actor_identity_id=$3`, [owned.site.id, owned.workspaceId, userId])).rows[0]
  const job = PageStudioProvisioningJobSchema.parse(saved?.job)
  await verifyCustomerProvisioningAuthority(job, db)
  const checkpoint = (await db.query(`SELECT site.current_checkpoint_id,cp.digest,cp.object_key FROM page_studio_sites site
    JOIN page_studio_checkpoints cp ON cp.id=site.current_checkpoint_id AND cp.tenant_id=site.tenant_id AND cp.client_id=site.client_id AND cp.site_id=site.id
    WHERE site.id=$1`, [owned.site.id])).rows[0]
  if (!checkpoint) throw denied()
  await readCustomerSession(token, run)
  await assertCustomerCmsSetupApproval(db, owned, userId)
  return { owned, approval, userId, job, checkpoint }
}
/** A complete provider observation is compared with the exact retained intent
 * and native checkpoint after locks are reacquired. Remote reads never hold SQL locks. */
async function verified<T>(token: string, options: CustomerCmsSetupOptions,
  work: (db: PageStudioQueryClient, current: Awaited<ReturnType<typeof context>>) => Promise<T>) {
  configuration(options)
  const run = options.runTransaction ?? transactionWithoutRetry
  const before = await run(db => context(db, token))
  const binding = options.env.PAGE_STUDIO_PROVISIONER as PageStudioProvisionerBinding
  const raw = await readPageStudioProvisioning(binding, { scope: before.owned.scope, requestKey: before.job.requestKey })
  const provider = PageStudioProvisioningJobSchema.parse(raw)
  if (provider.phase !== 'complete' || !provider.resources.database || !provider.resources.contentBinding || provider.resources.site !== before.owned.site.id) throw denied()
  return await run(async (db) => {
    const after = await context(db, token)
    if (!same(before, after)) throw denied()
    await verifyCustomerProvisioningAuthority(provider, db)
    return work(db, after)
  })
}
async function active(db: PageStudioQueryClient, token: string, options: CustomerCmsSetupOptions, current: Awaited<ReturnType<typeof context>>) {
  const config = configuration(options), loginHash = await digestPortalSessionToken(token)
  const { scope, workspaceId } = current.owned
  const rows = (await db.query<{ claims: unknown }>(`SELECT child.claims FROM page_studio_customer_editor_sessions child
    JOIN page_studio_customer_editor_handoffs handoff ON handoff.id=child.handoff_id
    WHERE handoff.purpose='cms-setup' AND handoff.login_session_hash=$1 AND handoff.identity_id=$2
      AND handoff.workspace_id=$3 AND handoff.site_id=$4 AND handoff.business_id=$5 AND handoff.tenant_id=$6
      AND handoff.dashboard_origin=$7 AND handoff.editor_origin=$8 AND child.revoked_at IS NULL
      AND child.expires_at>clock_timestamp()`, [loginHash, current.userId, workspaceId, scope.siteId, scope.businessId,
    scope.tenantId, config.dashboardOrigin, config.editorOrigin])).rows
  if (rows.length > 1) throw denied()
  if (!rows[0]) return null
  const claims = CustomerEditorClaimsSchema.parse(rows[0].claims)
  await assertCustomerEditorSessionAuthority(claims, 'cms:prepare', db)
  return claims
}
export async function customerCmsSetupAvailable(token: string, options: CustomerCmsSetupOptions) {
  configuration(options)
  const run = options.runTransaction ?? transactionWithoutRetry
  try {
    await run(db => context(db, token))
    return true
  } catch {
    // A missing setup approval may hide this feature, but must never mask a
    // revoked native parent or owner and return an earlier dashboard projection.
    await run(db => ownerContext(db, token))
    return false
  }
}
async function claimsFor(token: string, options: CustomerCmsSetupOptions, issue: boolean) {
  return verified(token, options, async (db, current) => {
    if (issue) {
      // This lock is only used by setup issuers, before any child access. It
      // serializes tabs for the same native login without upgrading shared row locks.
      await db.query('SET LOCAL lock_timeout=\'3s\'')
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,448))', [await digestPortalSessionToken(token)])
      await readCustomerSessionIdentityFromHash(db, await digestPortalSessionToken(token))
      await assertCustomerCmsSetupApproval(db, current.owned, current.userId)
    }
    const existing = await active(db, token, options, current)
    if (existing || !issue) return existing
    const deps = { runTransaction: (work => work(db)) as RunPageStudioTransaction }
    const handoff = await issueCustomerCmsSetupHandoff(token, options.configuration, deps)
    const child = await exchangeCustomerEditorSession(handoff.token, options.configuration,
      { ...deps, event: options.event, signToken: options.signToken })
    const row = (await db.query<{ claims: unknown }>('SELECT claims FROM page_studio_customer_editor_sessions WHERE nonce=$1', [child.sessionId])).rows[0]
    const claims = CustomerEditorClaimsSchema.parse(row?.claims)
    await assertCustomerEditorSessionAuthority(claims, 'cms:prepare', db)
    return claims
  })
}
export async function readCustomerCmsSetup(token: string, options: CustomerCmsSetupOptions) {
  const claims = await claimsFor(token, options, false)
  if (!claims) return CustomerCmsSetupStatusSchema.parse({ resumeRequired: true, prerequisites: [], adoption: null })
  const prerequisites = []
  for (const kind of kinds) prerequisites.push(await coordinateCustomerSchemaUpgrade({ action: 'status', kind }, claims, options))
  const value = await coordinateCmsAdoption({ action: 'status' }, { source: 'customer-session', claims, env: options.env, capability: 'cms:adopt' }, options)
  const { phase, adoptionId, progress, recoveryId, recoveryRequired, progressDigest } = value
  // Final native check after all provider observations. No provider details or child tokens leave Dashboard.
  await (options.runTransaction ?? transactionWithoutRetry)(db => assertCustomerEditorSessionAuthority(claims, 'cms:prepare', db))
  return CustomerCmsSetupStatusSchema.parse({ resumeRequired: false, prerequisites,
    adoption: { phase, adoptionId, progress, recoveryId, recoveryRequired, progressDigest } })
}
export async function mutateCustomerCmsSetup(token: string, input: unknown, options: CustomerCmsSetupOptions) {
  const request = CustomerCmsSetupRequestSchema.parse(input)
  const claims = await claimsFor(token, options, request.operation === 'resume')
  if (!claims) throw resume()
  if (request.operation === 'resume') return { resumed: true }
  if (request.operation === 'schema') return coordinateCustomerSchemaUpgrade(request.request, claims, options)
  const value = await coordinateCmsAdoption(request.request, { source: 'customer-session', claims, env: options.env, capability: 'cms:adopt' }, options)
  const { phase, adoptionId, progress, recoveryId, recoveryRequired, progressDigest } = value
  return CustomerCmsAdoptionStatusSchema.parse({ phase, adoptionId, progress, recoveryId, recoveryRequired, progressDigest })
}
