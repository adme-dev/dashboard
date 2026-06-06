// server/utils/email-marketing/campaigns.ts
// DB layer for campaigns + recipient materialization (Phase 2b-1). body_html is
// (re)rendered from body_source on write. NO sending here — the chunked Resend
// sender lands in 2b-2; this module only builds the resumable work queue.

import { createError } from 'h3'
import { queryRows, queryOne, execute, transaction } from '~~/server/utils/db'
import { getAppUrl } from '~~/server/utils/appUrl'
import { renderTemplateDocument } from './render'
import { isFlyhubFormat } from './render/flyhub-html-renderer'
import { buildCampaignPreflight, canTransition, type CampaignPreflightResult, type CampaignStatus } from './campaignSend'
import { evaluateSegment, isValidSegment } from './segment'
import { addEmailClientScopeCondition, type EmailClientScope } from './access'
import {
  prepareSendableHtmlWithMirroredAssets,
  type PrepareSendableHtmlWithMirroredAssetsOptions
} from './sendableHtml'

export interface Campaign {
  id: string
  name: string
  subject: string | null
  from_name: string | null
  from_email: string | null
  reply_to: string | null
  preview_text: string | null
  body_source: unknown
  body_html: string | null
  filter_rules: unknown
  content_type: string
  template_id: string | null
  status: CampaignStatus
  scheduled_at: string | null
  started_at: string | null
  finished_at: string | null
  client_id: string | null
  created_by: string | null
  to_send: number
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  unsubscribed: number
  preflight_result?: CampaignPreflightResult | null
  preflight_checked_at?: string | null
  recipient_snapshot?: unknown
  created_at: string
  updated_at: string
}

export interface CampaignRecipientSnapshot {
  listIds: string[]
  dedupedRecipients: number
  excludedUnsubscribed: number
  excludedSuppressed: number
  excludedBlocklisted: number
  toSend: number
  generatedAt: string
}

export interface CampaignHtmlPrepareOptions {
  appUrl?: string
  userId?: string
  fetchAsset?: PrepareSendableHtmlWithMirroredAssetsOptions['fetchAsset']
  uploadAsset?: PrepareSendableHtmlWithMirroredAssetsOptions['uploadAsset']
  mirrorExternalAssets?: boolean
}

function renderHtml(bodySource: unknown, subject?: string | null, previewText?: string | null): string {
  if (!isFlyhubFormat(bodySource)) return ''
  return renderTemplateDocument(bodySource, {
    subjectLine: subject ?? undefined,
    previewText: previewText ?? undefined
  })
}

function campaignSendUserId(campaign: Campaign, fallback?: string): string {
  return fallback || campaign.created_by || campaign.id
}

export async function prepareCampaignHtmlForSend(
  campaign: Campaign,
  opts: CampaignHtmlPrepareOptions = {}
): Promise<Campaign> {
  const html = campaign.body_html || ''
  if (!html) return campaign

  const prepared = await prepareSendableHtmlWithMirroredAssets(html, {
    appUrl: opts.appUrl || getAppUrl(),
    userId: campaignSendUserId(campaign, opts.userId),
    fetchAsset: opts.fetchAsset,
    uploadAsset: opts.uploadAsset,
    mirrorExternalAssets: opts.mirrorExternalAssets
  })
  if (prepared === html) return campaign

  const row = await queryOne<Campaign>(`
    UPDATE campaigns
    SET body_html = $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [campaign.id, prepared])
  return row || { ...campaign, body_html: prepared }
}

export async function listCampaigns(clientIds?: EmailClientScope): Promise<Campaign[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  addEmailClientScopeCondition(conditions, params, 'client_id', clientIds)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return queryRows<Campaign>(`SELECT * FROM campaigns ${where} ORDER BY updated_at DESC`, params)
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  return queryOne<Campaign>('SELECT * FROM campaigns WHERE id = $1', [id])
}

export async function getCampaignListIds(campaignId: string): Promise<string[]> {
  const rows = await queryRows<{ list_id: string }>(
    'SELECT list_id FROM campaign_lists WHERE campaign_id = $1', [campaignId]
  )
  return rows.map(r => r.list_id)
}

export async function getCampaignListClientIds(campaignId: string): Promise<Array<{ client_id: string | null }>> {
  return queryRows<{ client_id: string | null }>(`
    SELECT l.client_id
    FROM campaign_lists cl
    JOIN email_lists l ON l.id = cl.list_id
    WHERE cl.campaign_id = $1
      AND l.archived_at IS NULL
  `, [campaignId])
}

export async function buildCampaignRecipientSnapshot(
  campaignId: string,
  listIds: string[],
  toSend: number,
  generatedAt: string
): Promise<CampaignRecipientSnapshot> {
  const row = await queryOne<{
    deduped_recipients: number | string
    excluded_unsubscribed: number | string
    excluded_suppressed: number | string
    excluded_blocklisted: number | string
  }>(`
    WITH candidates AS (
      SELECT
        sl.subscriber_id,
        s.email,
        s.status AS subscriber_status,
        sl.status AS membership_status
      FROM campaign_lists cl
      JOIN subscriber_lists sl ON sl.list_id = cl.list_id
      JOIN email_subscribers s ON s.id = sl.subscriber_id
      WHERE cl.campaign_id = $1
    ),
    deduped AS (
      SELECT
        c.subscriber_id,
        BOOL_OR(c.membership_status = 'unsubscribed') AS has_unsubscribed_membership,
        BOOL_OR(c.membership_status <> 'unsubscribed') AS has_sendable_membership,
        BOOL_OR(c.subscriber_status = 'blocklisted') AS is_blocklisted,
        BOOL_OR(c.subscriber_status = 'enabled') AS is_enabled,
        BOOL_OR(sup.email IS NOT NULL) AS is_suppressed
      FROM candidates c
      LEFT JOIN suppression_list sup ON sup.email = c.email
      GROUP BY c.subscriber_id
    )
    SELECT
      COUNT(*)::int AS deduped_recipients,
      COUNT(*) FILTER (
        WHERE has_unsubscribed_membership AND NOT has_sendable_membership
      )::int AS excluded_unsubscribed,
      COUNT(*) FILTER (
        WHERE has_sendable_membership AND is_enabled AND is_suppressed
      )::int AS excluded_suppressed,
      COUNT(*) FILTER (
        WHERE has_sendable_membership AND is_blocklisted
      )::int AS excluded_blocklisted
    FROM deduped
  `, [campaignId])

  return {
    listIds,
    dedupedRecipients: Number(row?.deduped_recipients ?? 0),
    excludedUnsubscribed: Number(row?.excluded_unsubscribed ?? 0),
    excludedSuppressed: Number(row?.excluded_suppressed ?? 0),
    excludedBlocklisted: Number(row?.excluded_blocklisted ?? 0),
    toSend,
    generatedAt
  }
}

export async function createCampaign(input: {
  name: string
  subject?: string | null
  from_name?: string | null
  from_email?: string | null
  reply_to?: string | null
  preview_text?: string | null
  body_source?: unknown
  template_id?: string | null
  client_id?: string | null
  filter_rules?: unknown
  created_by: string | null
}): Promise<Campaign> {
  const source = input.body_source ?? { root: { type: 'EmailLayout', data: { childrenIds: [] } } }
  const html = renderHtml(source, input.subject, input.preview_text)
  const row = await queryOne<Campaign>(`
    INSERT INTO campaigns
      (name, subject, from_name, from_email, reply_to, preview_text,
       body_source, body_html, template_id, client_id, created_by, filter_rules)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb)
    RETURNING *
  `, [
    input.name,
    input.subject ?? null,
    input.from_name ?? null,
    input.from_email ?? null,
    input.reply_to ?? null,
    input.preview_text ?? null,
    JSON.stringify(source),
    html,
    input.template_id ?? null,
    input.client_id ?? null,
    input.created_by,
    input.filter_rules == null ? null : JSON.stringify(input.filter_rules)
  ])
  return row as Campaign
}

// Edits are only allowed while the campaign is a draft — once it's scheduled or
// sending, the body/recipients are locked. Re-renders body_html if body_source
// (or subject/preview_text) changes.
export async function updateCampaign(id: string, patch: {
  name?: string
  subject?: string | null
  from_name?: string | null
  from_email?: string | null
  reply_to?: string | null
  preview_text?: string | null
  body_source?: unknown
  template_id?: string | null
  scheduled_at?: string | null
  filter_rules?: unknown
}): Promise<Campaign | null> {
  const existing = await getCampaign(id)
  if (!existing) return null
  if (existing.status !== 'draft') {
    throw createError({ statusCode: 409, statusMessage: 'campaign_not_editable' })
  }

  const subject = patch.subject !== undefined ? patch.subject : existing.subject
  const previewText = patch.preview_text !== undefined ? patch.preview_text : existing.preview_text
  const source = patch.body_source !== undefined ? patch.body_source : existing.body_source
  const html = renderHtml(source, subject, previewText)
  const filterRules = patch.filter_rules !== undefined ? patch.filter_rules : existing.filter_rules

  const row = await queryOne<Campaign>(`
    UPDATE campaigns SET
      name         = $2,
      subject      = $3,
      from_name    = $4,
      from_email   = $5,
      reply_to     = $6,
      preview_text = $7,
      body_source  = $8::jsonb,
      body_html    = $9,
      template_id  = $10,
      scheduled_at = $11,
      filter_rules = $12::jsonb,
      updated_at   = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    patch.name ?? existing.name,
    subject,
    patch.from_name !== undefined ? patch.from_name : existing.from_name,
    patch.from_email !== undefined ? patch.from_email : existing.from_email,
    patch.reply_to !== undefined ? patch.reply_to : existing.reply_to,
    previewText,
    JSON.stringify(source ?? null),
    html,
    patch.template_id !== undefined ? patch.template_id : existing.template_id,
    patch.scheduled_at !== undefined ? patch.scheduled_at : existing.scheduled_at,
    filterRules == null ? null : JSON.stringify(filterRules)
  ])
  return row
}

// Replace the campaign's target lists (draft-only).
export async function setCampaignLists(campaignId: string, listIds: string[]): Promise<void> {
  const existing = await getCampaign(campaignId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  if (existing.status !== 'draft') {
    throw createError({ statusCode: 409, statusMessage: 'campaign_not_editable' })
  }
  await transaction(async (db) => {
    await db.query('DELETE FROM campaign_lists WHERE campaign_id = $1', [campaignId])
    for (const listId of listIds) {
      await db.query(
        'INSERT INTO campaign_lists (campaign_id, list_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [campaignId, listId]
      )
    }
  })
}

// Expand the target lists into the per-recipient work queue. Idempotent
// (re-runnable): dedups one send per subscriber across lists, excludes per-list
// unsubscribes, globally suppressed emails, and disabled/blocklisted subscribers.
// When the campaign carries a Segment (filter_rules), the recipient set is
// further narrowed to subscribers whose attribs/status match — evaluated in-app
// (no JSONB→SQL translation), then applied as an id allowlist on the insert.
// Sets campaigns.to_send. Does NOT send. Returns the recipient count.
export async function materializeRecipients(
  campaignId: string,
  opts: CampaignHtmlPrepareOptions = {}
): Promise<number> {
  const existing = await getCampaign(campaignId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  if (existing.status !== 'draft' && existing.status !== 'scheduled') {
    throw createError({ statusCode: 409, statusMessage: 'campaign_not_materializable' })
  }

  const prepared = await prepareCampaignHtmlForSend(existing, opts)
  const segment = isValidSegment(prepared.filter_rules) ? prepared.filter_rules : null

  return transaction(async (db) => {
    // Rebuild the pending queue so the result reflects the CURRENT lists +
    // segment (re-materialising after changing either must not leave stale
    // recipients, which would inflate to_send). Only 'pending' rows are cleared;
    // any already-'sent'/'failed' rows are preserved. Materialise is draft/
    // scheduled-only, so in practice every recipient is still pending here.
    await db.query(
      `DELETE FROM campaign_recipients WHERE campaign_id = $1 AND status = 'pending'`,
      [campaignId]
    )

    // With a segment: pull the eligible candidates (same base filter), evaluate
    // the segment in JS, and keep the surviving ids as an allowlist. Without a
    // segment, allowedIds stays null and the insert isn't narrowed.
    let allowedIds: string[] | null = null
    if (segment) {
      const { rows: candidates } = await db.query(`
        SELECT DISTINCT ON (s.id) s.id, s.email, s.name, s.status, s.attribs
        FROM subscriber_lists sl
        JOIN campaign_lists cl ON cl.list_id = sl.list_id AND cl.campaign_id = $1
        JOIN email_subscribers s ON s.id = sl.subscriber_id
        WHERE sl.status <> 'unsubscribed'
          AND s.status = 'enabled'
          AND NOT EXISTS (SELECT 1 FROM suppression_list sup WHERE sup.email = s.email)
        ORDER BY s.id
      `, [campaignId])
      allowedIds = candidates
        .filter(c => evaluateSegment({
          email: c.email,
          name: c.name,
          status: c.status,
          attribs: (c.attribs && typeof c.attribs === 'object' ? c.attribs : {}) as Record<string, unknown>
        }, segment))
        .map(c => c.id as string)
    }

    await db.query(`
      INSERT INTO campaign_recipients (campaign_id, subscriber_id, email)
      SELECT DISTINCT ON (s.id) $1, s.id, s.email
      FROM subscriber_lists sl
      JOIN campaign_lists cl ON cl.list_id = sl.list_id AND cl.campaign_id = $1
      JOIN email_subscribers s ON s.id = sl.subscriber_id
      WHERE sl.status <> 'unsubscribed'
        AND s.status = 'enabled'
        AND NOT EXISTS (SELECT 1 FROM suppression_list sup WHERE sup.email = s.email)
        AND ($2::uuid[] IS NULL OR s.id = ANY($2::uuid[]))
      ORDER BY s.id
      ON CONFLICT (campaign_id, subscriber_id) DO NOTHING
    `, [campaignId, allowedIds])

    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS n FROM campaign_recipients WHERE campaign_id = $1', [campaignId]
    )
    const toSend = Number(rows[0]?.n ?? 0)
    await db.query(
      'UPDATE campaigns SET to_send = $2, updated_at = NOW() WHERE id = $1', [campaignId, toSend]
    )
    return toSend
  })
}

export async function scheduleCampaign(
  campaignId: string,
  scheduledAt: string,
  opts: {
    sendingConfigured: boolean
    senderDomainAuthenticated: boolean
    allowedSenderDomains?: string[]
    checkedAt?: string
  } & CampaignHtmlPrepareOptions
): Promise<Campaign> {
  const existing = await getCampaign(campaignId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  if (existing.status !== 'draft') {
    throw createError({ statusCode: 409, statusMessage: 'campaign_not_schedulable' })
  }

  const toSend = await materializeRecipients(campaignId, opts)
  const campaign = await getCampaign(campaignId)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })

  const checkedAt = opts.checkedAt ?? new Date().toISOString()
  const preflight = buildCampaignPreflight({
    campaign,
    toSend,
    sendingConfigured: opts.sendingConfigured,
    senderDomainAuthenticated: opts.senderDomainAuthenticated,
    allowedSenderDomains: opts.allowedSenderDomains,
    checkedAt
  })
  const listIds = await getCampaignListIds(campaignId)
  const snapshot = await buildCampaignRecipientSnapshot(campaignId, listIds, toSend, checkedAt)

  if (preflight.blocked) {
    throw createError({
      statusCode: 422,
      statusMessage: 'campaign_preflight_blocked',
      data: { preflight, recipientSnapshot: snapshot }
    })
  }

  const row = await queryOne<Campaign>(`
    UPDATE campaigns
    SET status = 'scheduled',
        scheduled_at = $2,
        preflight_result = $3::jsonb,
        preflight_checked_at = $4::timestamptz,
        recipient_snapshot = $5::jsonb,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    campaignId,
    scheduledAt,
    JSON.stringify(preflight),
    checkedAt,
    JSON.stringify(snapshot)
  ])
  return row as Campaign
}

// Guarded status setter (used by later send/schedule flows). Exposed now so the
// transition rules live in one place.
export async function setCampaignStatus(id: string, to: CampaignStatus): Promise<void> {
  const existing = await getCampaign(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  if (!canTransition(existing.status, to)) {
    throw createError({ statusCode: 409, statusMessage: `invalid_transition_${existing.status}_to_${to}` })
  }
  // Stamp lifecycle timestamps: started_at on first entry to sending (kept if
  // re-entered from paused), finished_at on terminal sent/cancelled.
  const startedClause = to === 'sending' ? ', started_at = COALESCE(started_at, NOW())' : ''
  const finishedClause = (to === 'sent' || to === 'cancelled') ? ', finished_at = NOW()' : ''
  await execute(
    `UPDATE campaigns SET status = $2, updated_at = NOW()${startedClause}${finishedClause} WHERE id = $1`,
    [id, to]
  )
}

// Mark a campaign's remaining pending recipients as cancelled (used by cancel).
export async function cancelPendingRecipients(campaignId: string): Promise<number> {
  return execute(
    `UPDATE campaign_recipients SET status = 'cancelled' WHERE campaign_id = $1 AND status = 'pending'`,
    [campaignId]
  )
}
