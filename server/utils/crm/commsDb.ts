// server/utils/crm/commsDb.ts
// F10 — communication-log persistence + the unified (activities + comms) timeline.
import { queryRows, queryOne, execute, transaction } from '~~/server/utils/db'
import { contactPrefBlocks, type CommChannel, type CommDirection, type TimelineEntry } from '~~/server/utils/crm/comms'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireAllCrmRecordsAccess, requireCrmRecordAccess, type TransactionClient } from '~~/server/utils/crm/recordAccess'

export type CommTarget = 'person' | 'company'

export interface CreateCommInput {
  context?: CrmSearchContext
  clientId: string
  personId?: string | null
  companyId?: string | null
  channel: CommChannel
  direction?: CommDirection | null
  subject?: string | null
  body?: string | null
  occurredAt?: string | null
  source?: 'manual' | 'email_bridge' | 'lead_bridge'
  externalId?: string | null
  createdBy?: string | null
}

/** Insert a communication. With an externalId, dedupes via the partial unique index
 *  (returns null if the bridge already logged this one). */
export async function createComm(input: CreateCommInput) {
  if (input.context) {
    return await transaction(async (db) => {
      await requireAllCrmRecordsAccess(input.context!, [
        ...(input.personId ? [{ type: 'person' as const, id: input.personId }] : []),
        ...(input.companyId ? [{ type: 'company' as const, id: input.companyId }] : [])
      ], db)
      const result = await db.query(
        `INSERT INTO crm_communications
           (client_id, person_id, company_id, channel, direction, subject, body, occurred_at, source, external_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, now()),$9,$10,$11)
         ON CONFLICT (client_id, source, external_id) WHERE external_id IS NOT NULL DO NOTHING RETURNING *`,
        [input.context!.clientId, input.personId ?? null, input.companyId ?? null, input.channel,
          input.direction ?? null, input.subject ?? null, input.body ?? null, input.occurredAt ?? null,
          input.source ?? 'manual', input.externalId ?? null, input.createdBy ?? null]
      )
      return result.rows[0] ?? null
    })
  }
  return await queryOne(
    `INSERT INTO crm_communications
       (client_id, person_id, company_id, channel, direction, subject, body, occurred_at, source, external_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, now()),$9,$10,$11)
     ON CONFLICT (client_id, source, external_id) WHERE external_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      input.clientId, input.personId ?? null, input.companyId ?? null, input.channel,
      input.direction ?? null, input.subject ?? null, input.body ?? null, input.occurredAt ?? null,
      input.source ?? 'manual', input.externalId ?? null, input.createdBy ?? null,
    ],
  )
}

/**
 * F10 bridge — log an external communication (email send / lead inbound) onto the
 * CRM timeline when the contact maps to a CRM person. Gated by CRM_COMMS_BRIDGE_ENABLED
 * (off by default), idempotent by external_id, and honours contact prefs on OUTBOUND.
 * Returns whether a row was logged (and, if skipped for prefs, the reason).
 */
export interface BridgeCommunicationInput {
  clientId: string
  contactEmail: string
  channel: CommChannel
  direction: CommDirection
  source: 'email_bridge' | 'lead_bridge'
  externalId: string
  subject?: string | null
  body?: string | null
  occurredAt?: string | null
}

export async function bridgeCommunication(input: BridgeCommunicationInput): Promise<{ logged: boolean, blocked?: string }> {
  if (process.env.CRM_COMMS_BRIDGE_ENABLED !== 'true') return { logged: false }
  if (!input.contactEmail) return { logged: false }
  const person = await queryOne<{ id: string, do_not_contact: boolean, do_not_email: boolean, do_not_call: boolean, do_not_sms: boolean }>(
    `SELECT id, do_not_contact, do_not_email, do_not_call, do_not_sms
       FROM crm_people
      WHERE client_id = $1 AND LOWER(email) = LOWER($2) AND deleted_at IS NULL
      LIMIT 1`,
    [input.clientId, input.contactEmail],
  )
  if (!person) return { logged: false } // not a CRM contact — nothing to log
  if (input.direction === 'outbound') {
    const blocked = contactPrefBlocks(person, input.channel)
    if (blocked) return { logged: false, blocked }
  }
  const row = await createComm({
    clientId: input.clientId, personId: person.id, channel: input.channel, direction: input.direction,
    subject: input.subject, body: input.body, occurredAt: input.occurredAt,
    source: input.source, externalId: input.externalId, createdBy: null,
  })
  return { logged: !!row }
}

export async function deleteComm(id: string, scope: string | CrmSearchContext): Promise<boolean> {
  const clientId = typeof scope === 'string' ? scope : scope.clientId
  if (typeof scope !== 'string') {
    return await transaction(async (db: TransactionClient) => {
      const loaded = await db.query(
        `SELECT * FROM crm_communications WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, clientId]
      )
      const row = loaded.rows?.[0] as { person_id?: string | null, company_id?: string | null } | undefined
      if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
      await requireAllCrmRecordsAccess(scope, [
        ...(row.person_id ? [{ type: 'person' as const, id: row.person_id }] : []),
        ...(row.company_id ? [{ type: 'company' as const, id: row.company_id }] : [])
      ], db)
      const result = await db.query(
        `UPDATE crm_communications SET deleted_at = now()
          WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL RETURNING id`,
        [id, clientId]
      )
      return (result.rows?.length ?? 0) > 0
    })
  }
  const n = await execute(
    `UPDATE crm_communications SET deleted_at = now() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, clientId],
  )
  return n > 0
}

/** Unified, newest-first timeline for a target. A channel filter narrows to comms only. */
export async function listTimeline(
  scope: string | CrmSearchContext, target: CommTarget, targetId: string,
  opts: { channel?: CommChannel, limit?: number } = {},
): Promise<TimelineEntry[]> {
  const clientId = typeof scope === 'string' ? scope : scope.clientId
  if (typeof scope !== 'string') await requireCrmRecordAccess(scope, { type: target, id: targetId })
  const limit = Math.min(200, Math.max(1, opts.limit ?? 100))
  const targetCol = target === 'person' ? 'person_id' : 'company_id'

  const commBranch =
    `SELECT 'communication' AS source, c.id::text AS id, c.channel AS kind, c.direction,
            c.subject AS title, c.body, c.occurred_at AS at, u.name AS actor_name
       FROM crm_communications c
       LEFT JOIN team_members u ON u.id = c.created_by
      WHERE c.client_id = $1 AND c.deleted_at IS NULL AND c.${targetCol} = $2
        ${opts.channel ? 'AND c.channel = $3' : ''}`

  // When filtering by channel, activities (which have no channel) are excluded.
  // $3 means `channel` in the comms-only path, or `target type` in the merged path —
  // it is always referenced exactly once so PG can infer its type.
  const activityBranch = opts.channel
    ? ''
    : `UNION ALL
       SELECT 'activity' AS source, a.id::text AS id, a.type AS kind, NULL::text AS direction,
              a.title, a.body, a.created_at AS at, u2.name AS actor_name
         FROM crm_activities a
         LEFT JOIN team_members u2 ON u2.id = a.created_by
        WHERE a.client_id = $1 AND a.deleted_at IS NULL AND a.target_type = $3 AND a.target_id = $2`

  const params: unknown[] = [clientId, targetId, opts.channel ?? target]
  const sql = `SELECT * FROM ( ${commBranch} ${activityBranch} ) t ORDER BY at DESC LIMIT ${limit}`
  return await queryRows<TimelineEntry>(sql, params)
}
