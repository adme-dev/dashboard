// server/utils/email-marketing/campaigns.ts
// DB layer for campaigns + recipient materialization (Phase 2b-1). body_html is
// (re)rendered from body_source on write. NO sending here — the chunked Resend
// sender lands in 2b-2; this module only builds the resumable work queue.

import { queryRows, queryOne, execute, transaction } from '~~/server/utils/db'
import { renderTemplateDocument } from './render'
import { isFlyhubFormat } from './render/flyhub-html-renderer'
import { canTransition, type CampaignStatus } from './campaignSend'

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
  created_at: string
  updated_at: string
}

function renderHtml(bodySource: unknown, subject?: string | null, previewText?: string | null): string {
  if (!isFlyhubFormat(bodySource)) return ''
  return renderTemplateDocument(bodySource, {
    subjectLine: subject ?? undefined,
    previewText: previewText ?? undefined
  })
}

export async function listCampaigns(): Promise<Campaign[]> {
  return queryRows<Campaign>('SELECT * FROM campaigns ORDER BY updated_at DESC')
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
  created_by: string | null
}): Promise<Campaign> {
  const source = input.body_source ?? { root: { type: 'EmailLayout', data: { childrenIds: [] } } }
  const html = renderHtml(source, input.subject, input.preview_text)
  const row = await queryOne<Campaign>(`
    INSERT INTO campaigns
      (name, subject, from_name, from_email, reply_to, preview_text,
       body_source, body_html, template_id, client_id, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
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
    input.created_by
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
    patch.scheduled_at !== undefined ? patch.scheduled_at : existing.scheduled_at
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
// Sets campaigns.to_send. Does NOT send. Returns the recipient count.
export async function materializeRecipients(campaignId: string): Promise<number> {
  const existing = await getCampaign(campaignId)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  if (existing.status !== 'draft' && existing.status !== 'scheduled') {
    throw createError({ statusCode: 409, statusMessage: 'campaign_not_materializable' })
  }

  return transaction(async (db) => {
    await db.query(`
      INSERT INTO campaign_recipients (campaign_id, subscriber_id, email)
      SELECT DISTINCT ON (s.id) $1, s.id, s.email
      FROM subscriber_lists sl
      JOIN campaign_lists cl ON cl.list_id = sl.list_id AND cl.campaign_id = $1
      JOIN email_subscribers s ON s.id = sl.subscriber_id
      WHERE sl.status <> 'unsubscribed'
        AND s.status = 'enabled'
        AND NOT EXISTS (SELECT 1 FROM suppression_list sup WHERE sup.email = s.email)
      ORDER BY s.id
      ON CONFLICT (campaign_id, subscriber_id) DO NOTHING
    `, [campaignId])

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

// Guarded status setter (used by later send/schedule flows). Exposed now so the
// transition rules live in one place.
export async function setCampaignStatus(id: string, to: CampaignStatus): Promise<void> {
  const existing = await getCampaign(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  if (!canTransition(existing.status, to)) {
    throw createError({ statusCode: 409, statusMessage: `invalid_transition_${existing.status}_to_${to}` })
  }
  await execute('UPDATE campaigns SET status = $2, updated_at = NOW() WHERE id = $1', [id, to])
}
