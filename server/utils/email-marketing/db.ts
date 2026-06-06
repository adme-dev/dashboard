// server/utils/email-marketing/db.ts
// Thin DB layer for the email marketing module. All SQL lives here so the
// endpoints stay declarative. Uses the shared db.ts helpers.

import { queryRows, queryOne, queryCount, execute } from '~~/server/utils/db'
import { recordConsentEvent } from './audit'
import { addEmailClientScopeCondition, type EmailClientScope } from './access'
import type { EmailList, EmailSubscriber, MembershipSource, SubscriberInput } from './types'

export type SubscriberDeliverabilityFilter = 'mailable' | 'soft_bounced' | 'suppressed'

// ---------- Lists ----------

export interface ListWithCount extends EmailList {
  subscriber_count: number
}

export async function listLists(opts: {
  includeArchived?: boolean
  clientIds?: EmailClientScope
} = {}): Promise<ListWithCount[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  if (!opts.includeArchived) conditions.push('l.archived_at IS NULL')
  addEmailClientScopeCondition(conditions, params, 'l.client_id', opts.clientIds)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return queryRows<ListWithCount>(`
    SELECT l.*,
           COALESCE(c.cnt, 0)::int AS subscriber_count
    FROM email_lists l
    LEFT JOIN (
      SELECT list_id, COUNT(*) AS cnt
      FROM subscriber_lists
      WHERE status <> 'unsubscribed'
      GROUP BY list_id
    ) c ON c.list_id = l.id
    ${where}
    ORDER BY l.created_at DESC
  `, params)
}

export async function getList(id: string): Promise<EmailList | null> {
  return queryOne<EmailList>('SELECT * FROM email_lists WHERE id = $1', [id])
}

export async function getListClientIds(ids: string[]): Promise<Array<{ id: string, client_id: string | null }>> {
  if (!ids.length) return []
  return queryRows<Array<{ id: string, client_id: string | null }>[number]>(
    'SELECT id, client_id FROM email_lists WHERE id = ANY($1::uuid[]) AND archived_at IS NULL',
    [ids]
  )
}

export async function createList(input: {
  name: string
  description?: string | null
  client_id?: string | null
  double_optin?: boolean
  created_by: string
}): Promise<EmailList> {
  const row = await queryOne<EmailList>(`
    INSERT INTO email_lists (name, description, client_id, double_optin, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [
    input.name,
    input.description ?? null,
    input.client_id ?? null,
    input.double_optin ?? false,
    input.created_by
  ])
  return row as EmailList
}

export async function updateList(id: string, patch: {
  name?: string
  description?: string | null
  double_optin?: boolean
}): Promise<EmailList | null> {
  const sets: string[] = []
  const params: unknown[] = []
  const push = (col: string, val: unknown) => {
    params.push(val)
    sets.push(`${col} = $${params.length}`)
  }
  if (patch.name !== undefined) push('name', patch.name)
  if (patch.description !== undefined) push('description', patch.description)
  if (patch.double_optin !== undefined) push('double_optin', patch.double_optin)
  if (!sets.length) return getList(id)
  sets.push('updated_at = NOW()')
  params.push(id)
  return queryOne<EmailList>(
    `UPDATE email_lists SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
}

export async function archiveList(id: string): Promise<void> {
  await execute('UPDATE email_lists SET archived_at = NOW(), updated_at = NOW() WHERE id = $1', [id])
}

// ---------- Subscribers ----------

// Upsert by email. On conflict, fill in a missing name and merge attribs
// (new keys win), but never downgrade status. Returns the subscriber id.
export async function upsertSubscriber(input: SubscriberInput & {
  client_id?: string | null
  created_by?: string | null
}): Promise<string> {
  const row = await queryOne<{ id: string }>(`
    INSERT INTO email_subscribers (email, name, attribs, client_id, created_by)
    VALUES ($1, $2, $3::jsonb, $4, $5)
    ON CONFLICT (email) DO UPDATE SET
      name = COALESCE(email_subscribers.name, EXCLUDED.name),
      attribs = email_subscribers.attribs || EXCLUDED.attribs,
      updated_at = NOW()
    RETURNING id
  `, [
    input.email,
    input.name ?? null,
    JSON.stringify(input.attribs ?? {}),
    input.client_id ?? null,
    input.created_by ?? null
  ])
  return (row as { id: string }).id
}

// Add a subscriber to a list. Initial membership status depends on the list's
// double_optin flag: single-opt-in lists confirm immediately. Explicit re-adds
// reactivate unsubscribed members as unconfirmed; imports preserve unsubscribed
// state so a CSV upload cannot silently re-consent someone.
export async function addToList(
  subscriberId: string,
  listId: string,
  source: MembershipSource,
  audit?: {
    actorUserId?: string | null
    email?: string | null
    metadata?: Record<string, unknown> | null
  }
): Promise<void> {
  const list = await getList(listId)
  if (!list) return
  const initialStatus = list.double_optin ? 'unconfirmed' : 'confirmed'
  const reactivateUnsubscribed = source !== 'import'
  await execute(`
    INSERT INTO subscriber_lists (subscriber_id, list_id, status, source)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (subscriber_id, list_id) DO UPDATE SET
      status = CASE WHEN subscriber_lists.status = 'unsubscribed' AND $5::boolean
                    THEN 'unconfirmed' ELSE subscriber_lists.status END,
      unsubscribed_at = CASE WHEN subscriber_lists.status = 'unsubscribed' AND NOT $5::boolean
                             THEN subscriber_lists.unsubscribed_at ELSE NULL END
  `, [subscriberId, listId, initialStatus, source, reactivateUnsubscribed])
  if (source === 'import') {
    const email = audit?.email ?? (await queryOne<{ email: string }>(
      'SELECT email FROM email_subscribers WHERE id = $1',
      [subscriberId]
    ))?.email
    if (email) {
      await recordConsentEvent({
        subscriberId,
        email,
        listId,
        eventType: 'imported',
        source: 'import',
        actorUserId: audit?.actorUserId ?? null,
        metadata: audit?.metadata ?? null
      })
    }
  }
}

export async function removeFromList(subscriberId: string, listId: string): Promise<void> {
  await execute(`
    UPDATE subscriber_lists
    SET status = 'unsubscribed', unsubscribed_at = NOW()
    WHERE subscriber_id = $1 AND list_id = $2
  `, [subscriberId, listId])
}

export interface ListSubscribersResult {
  items: Array<EmailSubscriber & {
    suppression_reason?: string | null
    suppressed_at?: string | null
  }>
  total: number
  page: number
  page_size: number
}

export async function listSubscribers(opts: {
  listId?: string
  q?: string
  status?: string
  deliverability?: SubscriberDeliverabilityFilter
  page: number
  pageSize: number
  clientIds?: EmailClientScope
}): Promise<ListSubscribersResult> {
  const conds: string[] = []
  const params: unknown[] = []
  const push = (cond: string, val: unknown) => {
    params.push(val)
    conds.push(cond.replace('?', '$' + params.length))
  }

  const join = opts.listId ? 'JOIN subscriber_lists sl ON sl.subscriber_id = s.id' : ''
  const suppressionJoin = 'LEFT JOIN suppression_list sup ON sup.email = s.email'
  if (opts.listId) push('sl.list_id = ?', opts.listId)
  if (opts.status) push('s.status = ?', opts.status)
  if (opts.deliverability === 'suppressed') {
    conds.push('sup.email IS NOT NULL')
  } else if (opts.deliverability === 'soft_bounced') {
    conds.push('s.soft_bounce_count > 0')
  } else if (opts.deliverability === 'mailable') {
    conds.push('s.status = \'enabled\'')
    conds.push('sup.email IS NULL')
  }
  addEmailClientScopeCondition(conds, params, 's.client_id', opts.clientIds)
  if (opts.q) {
    // Two distinct placeholders (email + name). Use params.push()'s returned
    // length as each index — never reuse a $N, per the SQL-indexing gotcha.
    const safe = opts.q.replace(/[%_]/g, c => '\\' + c)
    const a = params.push(`%${safe}%`)
    const b = params.push(`%${safe}%`)
    conds.push(`(s.email ILIKE $${a} OR s.name ILIKE $${b})`)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const offset = (opts.page - 1) * opts.pageSize

  const items = await queryRows<ListSubscribersResult['items'][number]>(`
    SELECT DISTINCT
      s.*,
      s.soft_bounce_count::int AS soft_bounce_count,
      s.last_soft_bounce_at,
      sup.reason::text AS suppression_reason,
      sup.created_at AS suppressed_at
    FROM email_subscribers s ${join} ${suppressionJoin} ${where}
    ORDER BY s.created_at DESC
    LIMIT ${opts.pageSize} OFFSET ${offset}
  `, params)
  const total = await queryCount(
    `SELECT COUNT(DISTINCT s.id)::text AS count FROM email_subscribers s ${join} ${suppressionJoin} ${where}`,
    params
  )
  return { items, total, page: opts.page, page_size: opts.pageSize }
}

export async function getSubscriber(id: string): Promise<EmailSubscriber | null> {
  return queryOne<EmailSubscriber>('SELECT * FROM email_subscribers WHERE id = $1', [id])
}

export async function updateSubscriber(id: string, patch: {
  name?: string | null
  status?: string
  attribs?: Record<string, unknown>
}): Promise<EmailSubscriber | null> {
  const sets: string[] = []
  const params: unknown[] = []
  const push = (frag: string, val: unknown) => {
    params.push(val)
    sets.push(frag.replace('?', '$' + params.length))
  }
  if (patch.name !== undefined) push('name = ?', patch.name)
  if (patch.status !== undefined) push('status = ?', patch.status)
  if (patch.attribs !== undefined) push('attribs = ?::jsonb', JSON.stringify(patch.attribs))
  if (!sets.length) return getSubscriber(id)
  sets.push('updated_at = NOW()')
  params.push(id)
  return queryOne<EmailSubscriber>(
    `UPDATE email_subscribers SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
}

export async function deleteSubscriber(id: string): Promise<void> {
  await execute('DELETE FROM email_subscribers WHERE id = $1', [id])
}
