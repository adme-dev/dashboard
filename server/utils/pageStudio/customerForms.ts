import { createEmailRenderer } from '../email-marketing/render/client'
import { createError } from 'h3'
import { queryRowsFresh, transaction } from '~~/server/utils/db'
import { resolveCustomerFormAuthority, type CustomerFormAuthority } from './customerFormAuthority'
import { readCustomerSession, readCustomerSetup } from './customerSignup'
import { resolveCustomerWorkspaceAccess } from './customerWorkspaces'
import { getPageStudioDocument } from './documents'
import { admitFormDocument, recheckFormAuthority, sameTrustedFormAuthority, type FormDraftService, type TrustedFormAuthority, type TrustedFormContext } from './formAuthority'
import { readScopedMedia } from './standaloneMedia'
import { resolveScopedEmailTemplateMedia } from './emailTemplateMedia'
import { safePageStudioAssetSummary } from './standaloneWorkspace'
import type { PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import type { StandaloneSiteWorkspace } from '~~/shared/pageStudio/standaloneWorkspace'
import type { RunPageStudioTransaction } from './sites'

export interface CustomerFormsInput { sessionToken: string, siteId: string, environment: 'staging' }
interface ScopedAsset extends Record<string, unknown> { tenantId: string, clientId: string, siteId: string }
export interface CustomerFormsDependencies {
  authority?: typeof resolveCustomerFormAuthority
  document?: typeof getPageStudioDocument
  assets?: (scope: PageStudioContentScope) => Promise<ScopedAsset[]>
  discover?: typeof discoverCustomerDefaultSite
  runTransaction?: RunPageStudioTransaction
}
const denied = () => createError({ statusCode: 403, statusMessage: 'Customer form access is not available.' })
export function customerTrustedAuthority(current: CustomerFormAuthority): TrustedFormAuthority {
  return { scope: current.scope, actorId: current.actor.userId, authorityKey: JSON.stringify([current.actor.kind, current.actor.userId, current.actor.accountId, current.workspaceId]), canEdit: current.canEdit }
}
export function createCustomerFormContext(input: CustomerFormsInput, env: Record<string, unknown>, deps: CustomerFormsDependencies = {}): TrustedFormContext {
  const context: TrustedFormContext = {
    renderEmailPreview: createEmailRenderer(env).renderCustomerPreview,
    authorize: async writing => customerTrustedAuthority(await (deps.authority ?? resolveCustomerFormAuthority)({ ...input, writing }, { runTransaction: deps.runTransaction })),
    readDocument: scope => (deps.document ?? getPageStudioDocument)(scope.tenantId, scope.siteId, env.PAGE_STUDIO_CHECKPOINTS as Parameters<typeof getPageStudioDocument>[2]),
    service: env.PAGE_STUDIO_CONTENT_ROUTER as FormDraftService | undefined,
    resolveMedia: async (template) => {
      const before = await context.authorize(false)
      const check = () => recheckFormAuthority(context, before, false)
      const media = await resolveScopedEmailTemplateMedia(template, id => readScopedMedia({ authorize: async () => {
        return check()
      } }, id, { bucket: env.MEDIA_BUCKET as NonNullable<Parameters<typeof readScopedMedia>[2]>['bucket'] }), check)
      await check()
      return media
    }
  }
  return context
}
export async function listScopedPageStudioAssets(scope: PageStudioContentScope): Promise<ScopedAsset[]> {
  return queryRowsFresh<ScopedAsset>(`SELECT id::text, tenant_id AS "tenantId", client_id AS "clientId", site_id AS "siteId",
    media_type AS "mediaType", alt_text AS "altText", scan_status AS "scanStatus", publication_status AS "publicationStatus", renditions
    FROM page_studio_assets WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 ORDER BY created_at DESC LIMIT 200`, [scope.tenantId, scope.clientId, scope.siteId])
}
export async function readCustomerFormsWorkspace(context: TrustedFormContext, deps: CustomerFormsDependencies = {}): Promise<StandaloneSiteWorkspace> {
  const before = await context.authorize(false)
  const [document, assets] = await Promise.all([context.readDocument(before.scope), (deps.assets ?? listScopedPageStudioAssets)(before.scope)])
  const current = await recheckFormAuthority(context, before, false)
  admitFormDocument(document, current.scope)
  if (assets.some(asset => asset.tenantId !== current.scope.tenantId || asset.clientId !== current.scope.clientId || asset.siteId !== current.scope.siteId)) throw denied()
  return { canEdit: current.canEdit, document, assets: assets.map(safePageStudioAssetSummary) }
}
/** Default navigation is owner + completed setup only; ordinary site CRUD does
 * not call this reader and is decided independently by current membership. */
export async function discoverCustomerDefaultSite(sessionToken: string, deps: CustomerFormsDependencies = {}): Promise<CustomerFormAuthority> {
  const snapshot = await (deps.runTransaction ?? transaction)(async (db) => {
    const run: RunPageStudioTransaction = fn => fn(db)
    const user = await readCustomerSession(sessionToken, run)
    const setup = await readCustomerSetup(sessionToken, run)
    if (!setup.workspaceId) throw denied()
    const access = await resolveCustomerWorkspaceAccess({ identityId: user.identityId, workspaceId: setup.workspaceId }, run)
    if (access.role !== 'owner' || access.legacyBinding !== null) throw denied()
    const receipts = await db.query<{ workspace_id: string, site_id: string, business_id: string, tenant_id: string }>(`SELECT receipt.workspace_id, receipt.site_id, receipt.business_id, receipt.tenant_id
      FROM page_studio_customer_site_requests receipt JOIN page_studio_business_owners owner
      ON owner.id=receipt.business_id AND owner.workspace_id=receipt.workspace_id
      WHERE receipt.workspace_id=$1 AND owner.agency_client_id IS NULL`, [setup.workspaceId])
    if (receipts.rows.length !== 1) throw denied()
    return { user, receipt: receipts.rows[0]! }
  })
  const current = await (deps.authority ?? resolveCustomerFormAuthority)({ sessionToken, siteId: snapshot.receipt.site_id, environment: 'staging', writing: false }, { runTransaction: deps.runTransaction })
  if (current.workspaceId !== snapshot.receipt.workspace_id || current.actor.kind !== 'customer-user' || current.actor.userId !== snapshot.user.identityId || current.actor.accountId !== snapshot.user.accountId
    || current.scope.siteId !== snapshot.receipt.site_id || current.scope.clientId !== snapshot.receipt.business_id || current.scope.businessId !== snapshot.receipt.business_id || current.scope.tenantId !== snapshot.receipt.tenant_id || current.scope.environment !== 'staging') throw denied()
  return current
}
export async function readCustomerDefaultWebsite(sessionToken: string, env: Record<string, unknown>, deps: CustomerFormsDependencies = {}) {
  const discover = deps.discover ?? discoverCustomerDefaultSite
  const before = await discover(sessionToken, deps)
  const context = createCustomerFormContext({ sessionToken, siteId: before.scope.siteId, environment: 'staging' }, env, deps)
  const authorize = context.authorize
  context.authorize = async (writing) => {
    const current = await authorize(writing)
    if (!sameTrustedFormAuthority(customerTrustedAuthority(before), current)) throw denied()
    return current
  }
  const workspace = await readCustomerFormsWorkspace(context, deps)
  const after = await discover(sessionToken, deps)
  if (!sameTrustedFormAuthority(customerTrustedAuthority(before), customerTrustedAuthority(after))) throw denied()
  return { ...workspace, canEdit: after.canEdit }
}
export async function readCustomerFormsAvailability(sessionToken: string, deps: CustomerFormsDependencies = {}) {
  const discover = deps.discover ?? discoverCustomerDefaultSite
  const before = await discover(sessionToken, deps)
  const after = await discover(sessionToken, deps)
  if (!sameTrustedFormAuthority(customerTrustedAuthority(before), customerTrustedAuthority(after))) throw denied()
  return { available: true, siteId: after.scope.siteId }
}
