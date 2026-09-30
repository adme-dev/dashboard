import { z } from 'zod'
import { createError } from 'h3'
import { transaction } from '~~/server/utils/db'
import { CustomerProvisioningRecoverySchema, type CustomerDashboard } from '~~/shared/pageStudio/customerDashboard'
import { readCustomerSession, readCustomerSetup } from './customerSignup'
import { resolveCustomerWorkspaceAccess } from './customerWorkspaces'
import { createCustomerPreviewSite, CustomerPreviewPolicySchema } from './customerSites'
import { readCustomerProvisioningRecovery, recoverCustomerProvisioning, dispatchCustomerProvisioning, prepareCustomerProvisioning, readCustomerProvisioningPreviewAuthority, verifyCustomerProvisioningAuthority } from './customerProvisioning'
import { PageStudioProvisioningJobSchema, readPageStudioProvisioning, type PageStudioProvisionerBinding } from './provisioningBinding'
import type { RunPageStudioTransaction } from './sites'

export const CustomerPreviewApprovalSchema = z.object({
  workspaceId: z.string().uuid(),
  starterVersion: PageStudioProvisioningJobSchema.shape.templateId,
  policy: CustomerPreviewPolicySchema.extend({ pagesPerSiteLimit: z.number().int().min(3).max(1000) })
}).strict()
type Approval = z.infer<typeof CustomerPreviewApprovalSchema>
export interface CustomerDashboardDependencies {
  enabled: boolean
  binding?: PageStudioProvisionerBinding
  approval?: Approval | null
  approvals?: Approval[]
  runTransaction?: RunPageStudioTransaction
}
const denied = () => createError({ statusCode: 403, statusMessage: 'This preview is not available. Contact support for help.' })

async function context(token: string, options: CustomerDashboardDependencies) {
  return (options.runTransaction ?? transaction)(async (db) => {
    const run: RunPageStudioTransaction = callback => callback(db)
    const user = await readCustomerSession(token, run)
    const setup = await readCustomerSetup(token, run)
    const base: CustomerDashboard = { businessName: setup.draft.businessName, businessType: setup.draft.businessType,
      timezone: setup.draft.timezone, state: 'setup-required', stage: 0, canCreate: false, canRetry: false }
    if (!setup.workspaceId) return { base, user, setup, receipt: null, intent: null, approval: null, resumable: false }
    const access = await resolveCustomerWorkspaceAccess({ identityId: user.identityId, workspaceId: setup.workspaceId }, run)
    if (access.role !== 'owner' || access.legacyBinding) throw denied()
    const receipt = (await db.query<{ site_id: string }>('SELECT site_id FROM page_studio_customer_site_requests WHERE workspace_id = $1', [setup.workspaceId])).rows[0] ?? null
    const intent = receipt ? (await db.query<{ job: unknown }>('SELECT job FROM page_studio_customer_provisioning_intents WHERE site_id = $1', [receipt.site_id])).rows[0] ?? null : null
    const candidate = options.approval ?? options.approvals?.find(item => item.workspaceId === setup.workspaceId)
    const parsed = CustomerPreviewApprovalSchema.safeParse(candidate)
    let approval: Approval | null = null
    if (parsed.success && parsed.data.workspaceId === setup.workspaceId) {
      const approved = await db.query(`SELECT id FROM team_members WHERE id = $1 AND is_active = TRUE
        AND $2::timestamptz > clock_timestamp() FOR SHARE`, [parsed.data.policy.approvedBy, parsed.data.policy.expiresAt])
      if (approved.rows[0]) approval = parsed.data
    }
    let resumable = false
    if (receipt && !intent) {
      try {
        await readCustomerProvisioningPreviewAuthority(db, receipt.site_id, user.identityId)
        resumable = true
      } catch (error) {
        if ((error as { statusCode?: number })?.statusCode !== 403) throw error
      }
    }
    return { base, user, setup, receipt, intent, approval, resumable }
  })
}

async function recoverySupported(binding: PageStudioProvisionerBinding | undefined) {
  try {
    // RPC proxies may expose a callable property for a missing remote method.
    // Only a successful version handshake with both workers establishes support.
    return z.object({ version: z.literal(1) }).strict().safeParse(await binding?.readCustomerRecoverySupport?.()).success
  } catch { return false }
}

/** Customer-facing read model; never expose coordinator jobs or provider errors. */
export async function readCustomerDashboard(token: string, options: CustomerDashboardDependencies): Promise<CustomerDashboard> {
  const current = await context(token, options)
  const { base } = current
  if (!current.setup.workspaceId) return base
  const configured = options.enabled && Boolean(options.binding?.readProvisioning && options.binding?.createProvisioning)
  if (!current.receipt) return { ...base, state: configured && current.approval ? 'available' : 'approval-pending', canCreate: Boolean(configured && current.approval) }
  if (!configured) return { ...base, state: 'unavailable' }
  if (!current.intent) return { ...base, state: current.resumable ? 'preparing' : 'needs-attention', canRetry: current.resumable }
  const parsed = PageStudioProvisioningJobSchema.safeParse(current.intent.job)
  if (!parsed.success || parsed.data.actor?.userId !== current.user.identityId) return { ...base, state: 'needs-attention' }
  const native = (job: z.infer<typeof PageStudioProvisioningJobSchema>) => (options.runTransaction ?? transaction)(db => verifyCustomerProvisioningAuthority(job, db))
  try {
    let recovery = await readCustomerProvisioningRecovery({ sessionToken: token, siteId: current.receipt.site_id }, { runTransaction: options.runTransaction })
    if (recovery.recoveryRequired) {
      const supported = await recoverySupported(options.binding)
      recovery = await readCustomerProvisioningRecovery({ sessionToken: token, siteId: current.receipt.site_id }, { runTransaction: options.runTransaction })
      if (!supported) return { ...base, state: 'unavailable' }
    }
    if (recovery.recoveryRequired) return { ...base, state: 'recovery-required', recovery: {
      expectedRecoveryId: recovery.expectedRecoveryId, expectedJobDigest: recovery.expectedJobDigest
    } }
    await native(parsed.data)
  } catch {
    // Current-user access is checked independently, including on blocked jobs.
    await context(token, options)
    return { ...base, state: 'needs-attention' }
  }
  let retained: unknown
  try {
    retained = await readPageStudioProvisioning(options.binding, { scope: parsed.data.scope, requestKey: parsed.data.requestKey })
  } catch {
    await context(token, options)
    return { ...base, state: 'unavailable' }
  }
  // The native login/workspace may have been revoked during the external read.
  await context(token, options)
  const saved = retained === null ? parsed : PageStudioProvisioningJobSchema.safeParse(retained)
  if (!saved.success) return { ...base, state: 'needs-attention' }
  try {
    await native(saved.data)
  } catch {
    return { ...base, state: 'needs-attention' }
  }
  if (retained === null) return { ...base, state: 'preparing', canRetry: true }
  const phase = saved.data.phase
  if (phase === 'failed') {
    if (!(await recoverySupported(options.binding))) return { ...base, state: 'needs-attention' }
    const recovery = await readCustomerProvisioningRecovery({ sessionToken: token, siteId: current.receipt.site_id }, { runTransaction: options.runTransaction })
    return { ...base, state: 'recovery-required', recovery: { expectedRecoveryId: recovery.expectedRecoveryId, expectedJobDigest: recovery.expectedJobDigest } }
  }
  const stage = ['requested', 'validated', 'resources-created', 'site-seeded', 'content-seeded', 'complete'].indexOf(phase)
  return { ...base, stage, state: phase === 'complete' ? 'verification-pending' : 'preparing' }
}

/** Body-free customer action. All scope, approval and idempotency data are server-owned. */
export async function createCustomerDashboardPreview(token: string, options: CustomerDashboardDependencies) {
  if (!options.enabled || !options.binding?.readProvisioning || !options.binding?.createProvisioning) throw denied()
  const siteId = await (options.runTransaction ?? transaction)(async (db) => {
    const run: RunPageStudioTransaction = callback => callback(db)
    const current = await context(token, { ...options, runTransaction: run })
    if (!current.setup.workspaceId) throw denied()
    let site = current.receipt?.site_id
    if (!site) {
      if (!current.approval) throw denied()
      const request = (await db.query<{ creation_request_id: string }>('SELECT creation_request_id FROM page_studio_customer_setup_drafts WHERE identity_id = $1', [current.user.identityId])).rows[0]!
      site = (await createCustomerPreviewSite({ identityId: current.user.identityId, workspaceId: current.setup.workspaceId,
        requestId: request.creation_request_id, name: current.setup.draft.businessName,
        route: `preview-${current.setup.workspaceId}`, starterVersion: current.approval.starterVersion },
      { runTransaction: run, previewPolicy: current.approval.policy })).site.id
    }
    await prepareCustomerProvisioning({ sessionToken: token, siteId: site }, { runTransaction: run })
    return site
  })
  await dispatchCustomerProvisioning({ sessionToken: token, siteId }, { binding: options.binding, runTransaction: options.runTransaction })
  return readCustomerDashboard(token, options)
}

/** An explicit, scoped recovery action; the immutable original intent is reused. */
export async function recoverCustomerDashboardPreview(token: string, body: unknown, options: CustomerDashboardDependencies) {
  const request = CustomerProvisioningRecoverySchema.safeParse(body)
  if (!request.success || !options.enabled || !options.binding?.readProvisioning || !options.binding?.createProvisioning || !(await recoverySupported(options.binding))) throw denied()
  const current = await context(token, options)
  if (!current.receipt || !current.intent) throw denied()
  await readCustomerProvisioningRecovery({ sessionToken: token, siteId: current.receipt.site_id }, { runTransaction: options.runTransaction })
  const original = PageStudioProvisioningJobSchema.parse(current.intent.job)
  const providerJob = await readPageStudioProvisioning(options.binding, { scope: original.scope, requestKey: original.requestKey })
  const recovered = await recoverCustomerProvisioning({ sessionToken: token, siteId: current.receipt.site_id, ...request.data }, { runTransaction: options.runTransaction, providerJob })
  await dispatchCustomerProvisioning({ sessionToken: token, siteId: current.receipt.site_id }, { binding: options.binding, runTransaction: options.runTransaction, resumeAttempt: recovered.resumeAttempt })
  return readCustomerDashboard(token, options)
}
