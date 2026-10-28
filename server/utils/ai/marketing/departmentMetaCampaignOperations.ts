import { createHash } from 'node:crypto'
import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { getCampaigns, getAdSets, getPages, uploadAdImage, createAdCreative, createAd, getAdLaunchBinding } from '~~/server/utils/metaClient'
import { assertPublicSiteOrigin } from '~~/server/utils/siteIntelligence/urlPolicy'
import { resolveMcpStaffContext } from '../mcp/staffAuthority'
import { requireMarketingDepartment } from './departmentAuthority'
import { requireIndependentMarketingReviewer, assertMarketingCapabilityAtBoundary } from './reviewAuthority'
import { campaignDenied, requireDepartmentClient, departmentRuntimeEnv } from './departmentCampaignSupport'
import { paidHash, preparePaidProposal, readPaidProposal, paidProposalView, claimPaidProposal, type PaidProposal } from './departmentPaidProposals'
import { departmentMetaCampaignContracts, metaLaunchInput, assertDepartmentBannerAsset } from './departmentMetaCampaignSchemas'
import { resolveMcpRuntimeConfig } from '../mcp/runtimeConfig'
import { resolveMarketingProviderConfig } from '~~/server/utils/marketingProviderConfig'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import type { z } from 'zod'

const ACTION = 'department_meta_ad_launch'
type Input = z.infer<typeof metaLaunchInput>
async function authority(ctx: ToolContext, write: boolean) {
  if (ctx.source === 'mcp') return requireMarketingDepartment(ctx, write)
  const fresh = await resolveMcpStaffContext(ctx.event, ctx.userId, [])
  if (!fresh.permissionGroups?.includes('MARKETING_MANAGEMENT') && !fresh.permissionGroups?.includes('ADMIN')) campaignDenied()
  if (write && fresh.assistantReadOnly) campaignDenied()
  return { ...fresh, clientScope: ctx.clientScope }
}
async function imageBytes(url: URL) {
  await assertPublicSiteOrigin(url.origin)
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
  if (!response.ok || !response.body || !/^image\/(png|jpeg)(;|$)/i.test(response.headers.get('content-type') ?? '') || Number(response.headers.get('content-length') ?? 0) > 10_000_000) throw new Error('Image unavailable')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 10_000_000) throw new Error('Image too large')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = Buffer.concat(chunks)
  if (!(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))) throw new Error('PNG/JPEG export required')
  return bytes
}
async function load(ctx: ToolContext, input: Input) {
  await requireDepartmentClient(ctx, input.clientId)
  const c = await queryOneFresh<{ id: string, account_id: string, access_token: string, scopes: string[], token_expires_at: string | null }>(`SELECT id,account_id,access_token,scopes,token_expires_at FROM social_connections
 WHERE id=$1 AND client_id=$2 AND platform='meta' AND status='active'`, [input.connectionId, input.clientId])
  if (!c?.access_token || !c.scopes?.includes('ads_management') || (c.token_expires_at && !(Date.parse(c.token_expires_at) > Date.now()))) campaignDenied('not_ready')
  const page = await queryOneFresh(`SELECT id FROM social_accounts WHERE client_id=$1 AND platform='facebook' AND platform_account_id=$2 AND is_active=TRUE AND (token_expires_at IS NULL OR token_expires_at>NOW())`, [input.clientId, input.pageId])
  if (!page) campaignDenied('page_mapping_required')
  const accountId = c.account_id.replace(/^act_/, '')
  if (!/^\d+$/.test(accountId)) campaignDenied('binding_changed')
  const asset = await queryOneFresh<{ project_id: string, url: string, r2_key: string, format_key: string, version: number }>(`SELECT p.project_id,e.url,e.r2_key,e.format_key,p.version FROM banner_published p
 JOIN banner_projects b ON b.id=p.project_id JOIN banner_exports e ON e.project_id=b.id AND e.format_key=p.format_key
 WHERE p.id=$1 AND e.id=$2 AND b.client_id=$3 AND e.export_type IN ('png','jpg','jpeg')`, [input.publishedId, input.exportId, input.clientId])
  if (!asset) campaignDenied('not_found')
  const assetUrl = assertDepartmentBannerAsset(asset.url, asset.r2_key, asset.project_id, departmentRuntimeEnv(ctx).R2_PUBLIC_URL ?? '')
  await assertPublicSiteOrigin(input.linkUrl)
  const act = `act_${accountId}`
  const campaigns = await getCampaigns(act, c.access_token)
  const campaign = campaigns.find(c => c.id === input.campaignId)
  if (!campaign) campaignDenied('binding_changed')
  const adSet = (await getAdSets(input.campaignId, c.access_token)).find(a => a.id === input.adSetId)
  if (!adSet || (adSet.account_id && adSet.account_id !== accountId) || (adSet.campaign_id && adSet.campaign_id !== input.campaignId) || !(await getPages(c.access_token)).some(p => p.id === input.pageId)) campaignDenied('binding_changed')
  const bytes = await imageBytes(assetUrl)
  const snapshot = { accountId, connectionId: c.id, asset, imageHash: createHash('sha256').update(bytes).digest('hex'), campaign, adSet, pageId: input.pageId }
  return { connection: c, accountId, act, asset, bytes, snapshot }
}
async function requester(ctx: ToolContext, p: PaidProposal) {
  // Browser-origin proposals use current browser role/client authority; MCP-origin proposals also retain the grant requirement.
  const fresh = await resolveMcpStaffContext(ctx.event, p.user_id, [])
  if ((!fresh.permissionGroups?.includes('MARKETING_MANAGEMENT') && !fresh.permissionGroups?.includes('ADMIN')) || fresh.assistantReadOnly) campaignDenied()
  await requireDepartmentClient(fresh, p.resolved_payload.clientId)
  if (p.resolved_payload.requestKey.startsWith('mcp:')) await assertMarketingCapabilityAtBoundary(ctx.event, p.user_id, p.resolved_payload.clientId, 'department_management')
}
async function execute(ctx: ToolContext, p: PaidProposal, current: Awaited<ReturnType<typeof load>>) {
  // Only the requester executes their own independently approved proposal.
  if (ctx.userId !== p.user_id) campaignDenied('forbidden')
  const reviewerId = p.result_payload?.reviewerId
  if (typeof reviewerId !== 'string' || p.result_payload?.approvedRevision !== p.resolved_payload.revision) campaignDenied('approval_required')
  await requester(ctx, p)
  await requireIndependentMarketingReviewer(ctx.event, { requesterId: p.user_id, reviewerId, clientId: p.resolved_payload.clientId })
  ctx = await authority(ctx, true)
  await requireDepartmentClient(ctx, p.resolved_payload.clientId)
  if (!resolveMarketingProviderConfig(departmentRuntimeEnv(ctx)).metaAdPublish) campaignDenied('disabled')
  await claimPaidProposal(p)
  const input = metaLaunchInput.parse(p.resolved_payload.input)
  const receipt: Record<string, unknown> = { complete: false, reviewerId, approvedRevision: p.resolved_payload.revision, status: 'PAUSED' }
  let publishId: string | undefined
  const retain = async () => {
    await transactionWithoutRetry(async (db) => {
      const saved = (await db.query(`UPDATE ai_pending_actions SET result_payload=$2::jsonb WHERE id=$1 AND status='executed' AND tool_name=$3 RETURNING id`, [p.id, JSON.stringify(receipt), ACTION])).rows[0]
      if (!saved) throw new Error('Receipt claim unavailable')
      if (publishId) await db.query(`UPDATE banner_ad_publishes SET image_hash=$2,creative_id=$3,ad_id=$4,status=$5,metadata=$6::jsonb,updated_at=NOW() WHERE id=$1`,
        [publishId, receipt.imageHash ?? null, receipt.creativeId ?? null, receipt.adId ?? null, receipt.complete ? 'paused' : 'reconciliation_required', JSON.stringify({ proposalId: p.id, revision: p.resolved_payload.revision, exportId: input.exportId })])
    })
  }
  try {
    const row = await transactionWithoutRetry(async db => (await db.query(`INSERT INTO banner_ad_publishes
   (project_id,published_id,platform,account_id,campaign_id,ad_group_id,page_id,primary_texts,headlines,descriptions,call_to_action,link_url,ad_status,status,published_by,metadata)
   VALUES ($1,$2,'meta_ads',$3,$4,$5,$6,$7,$8,$9,$10,$11,'PAUSED','reconciliation_required',$12,$13::jsonb) RETURNING id`,
    [current.asset.project_id, input.publishedId, current.accountId, input.campaignId, input.adSetId, input.pageId, input.primaryTexts, input.headlines, input.descriptions, input.callToAction, input.linkUrl, ctx.userId, JSON.stringify({ proposalId: p.id, revision: p.resolved_payload.revision, exportId: input.exportId })])).rows[0])
    if (!row) throw new Error('Claim receipt unavailable')
    publishId = row.id
    receipt.publishId = publishId
    await retain()
    const image = await uploadAdImage(current.act, current.connection.access_token, current.bytes, { retries: 0 })
    receipt.imageHash = image.hash
    await retain()
    const creative = await createAdCreative(current.act, current.connection.access_token, { ...input, name: input.adName, imageHash: image.hash }, { retries: 0 })
    receipt.creativeId = creative.id
    await retain()
    // Refresh actor/reviewer/client/connection and immutable bytes again before creating the paid ad.
    ctx = await authority(ctx, true)
    await requester(ctx, p)
    await requireIndependentMarketingReviewer(ctx.event, { requesterId: p.user_id, reviewerId, clientId: input.clientId })
    const fresh = await load(ctx, input)
    if (paidHash({ action: ACTION, input, snapshot: fresh.snapshot }) !== p.resolved_payload.revision || !resolveMarketingProviderConfig(departmentRuntimeEnv(ctx)).metaAdPublish) throw new Error('Launch changed')
    const ad = await createAd(fresh.act, fresh.connection.access_token, { name: input.adName, adsetId: input.adSetId, creativeId: creative.id, status: 'PAUSED' }, { retries: 0 })
    receipt.adId = ad.id
    await retain()
    const readback = await getAdLaunchBinding(ad.id, fresh.connection.access_token)
    if (readback.id !== ad.id || readback.accountId !== fresh.accountId || readback.campaignId !== input.campaignId || readback.adSetId !== input.adSetId || readback.creativeId !== creative.id || readback.status !== 'PAUSED') throw new Error('Paid ad readback mismatch')
    receipt.readbackVerified = true
    receipt.complete = true
    receipt.providerServingVerified = false
    await retain()
    return ok({ proposalId: p.id, ...receipt })
  } catch {
    return fail('Paid Meta launch held for reconciliation; do not repeat provider creation.', 'reconciliation_required', { proposalId: p.id, ...receipt, complete: false })
  }
}
export async function runDepartmentMetaCampaignOperation(name: string, raw: unknown, original: ToolContext, key?: string, digest?: string): Promise<ToolResult> {
  try {
    const contract = departmentMetaCampaignContracts.find(c => c[0] === name)
    if (!contract) campaignDenied('not_found')
    const parsed = contract[1].safeParse(raw)
    if (!parsed.success) campaignDenied('bad_args')
    const input = parsed.data as { clientId: string, proposalId?: string, expectedRevision?: string }
    const ctx = await authority(original, contract[2])
    if (original.source === 'mcp') {
      const f = resolveMcpRuntimeConfig(ctx.event)
      if (!f.serverEnabled || !f.suiteFlags.banners || (contract[2] && !f.suiteFlags.writes)) campaignDenied('disabled')
    }
    await requireDepartmentClient(ctx, input.clientId)
    if (name === 'marketing_prepare_meta_ad_launch') {
      const intent = metaLaunchInput.parse(parsed.data)
      const current = await load(ctx, intent)
      return ok({ ...paidProposalView(await preparePaidProposal(ACTION, ctx.userId, intent, current.snapshot, key!, digest!, original.source === 'mcp' ? 'mcp' : 'department_browser', { accountId: current.accountId, imageSha256: current.snapshot.imageHash, campaign: current.snapshot.campaign, adSet: current.snapshot.adSet })), requiresIndependentReview: true })
    }
    const p = await readPaidProposal(input.proposalId!, ACTION, input.clientId)
    if (name === 'marketing_get_meta_ad_launch') return ok(paidProposalView(p))
    if (input.expectedRevision !== p.resolved_payload.revision) campaignDenied('revision_conflict')
    if (p.status === 'executed') return p.result_payload?.complete === true ? ok(paidProposalView(p)) : fail('Launch held for reconciliation.', 'reconciliation_required')
    await requester(ctx, p)
    const current = await load(ctx, metaLaunchInput.parse(p.resolved_payload.input))
    if (paidHash({ action: ACTION, input: p.resolved_payload.input, snapshot: current.snapshot }) !== p.resolved_payload.revision) campaignDenied('revision_conflict')
    if (name === 'marketing_approve_meta_ad_launch') {
      await requireIndependentMarketingReviewer(ctx.event, { requesterId: p.user_id, reviewerId: ctx.userId, clientId: input.clientId })
      const review = { reviewerId: ctx.userId, approvedRevision: p.resolved_payload.revision }
      const row = await transactionWithoutRetry(async db => (await db.query(`UPDATE ai_pending_actions SET result_payload=$2::jsonb
    WHERE id=$1 AND tool_name=$3 AND source IN ('mcp','department_browser') AND status='proposed' AND expires_at>NOW() AND resolved_payload=$4::jsonb AND result_payload IS NULL RETURNING id`, [p.id, JSON.stringify(review), ACTION, JSON.stringify(p.resolved_payload)])).rows[0])
      if (!row) campaignDenied('revision_conflict')
      return ok({ proposalId: p.id, revision: p.resolved_payload.revision, approved: true })
    }
    return await execute(ctx, p, current)
  } catch (error) { return fail('Paid Meta launch unavailable or authority changed.', (error as { campaignCode?: string }).campaignCode ?? 'unavailable') }
}
