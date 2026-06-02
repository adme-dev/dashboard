// server/utils/crm/meetingBridge.ts
// Deterministic resolution of office-meeting guests → CRM targets, plus the
// pure CRM-task payload builder. DB-touching helpers live below the pure block.
import { queryRows, queryOne, execute, transaction } from '~~/server/utils/db'
import { recordFieldChanges } from './audit'
import type { TASK_PRIORITIES } from './tasks'

export interface CandidatePerson {
  person_id: string
  client_id: string
  company_id: string | null
  company_name: string | null
  email: string          // already normalized; the guest email that matched
  display_name: string
}

export interface CandidateOpp {
  opportunity_id: string
  client_id: string
  person_id: string | null
  company_id: string | null
  name: string
  updated_at: string     // ISO timestamp
}

export interface TargetRef {
  client_id: string
  target_type: 'opportunity' | 'person' | 'company'
  target_id: string
  label: string
}

export interface TargetProposal extends TargetRef {
  matched_email: string
  person_id: string
  confidence: 'high' | 'ambiguous'
  alternatives: TargetRef[]
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase()
}

function byUpdatedDesc(a: CandidateOpp, b: CandidateOpp): number {
  // Secondary sort on the stable opportunity_id keeps the "most-recently-updated
  // wins" contract deterministic when two opps share an updated_at.
  return b.updated_at.localeCompare(a.updated_at) || a.opportunity_id.localeCompare(b.opportunity_id)
}

export function rankTargets(input: {
  candidatePeople: CandidatePerson[]
  candidateOpps: CandidateOpp[]
}): TargetProposal[] {
  // Dedupe people by person_id (a person can match via multiple guest emails);
  // keep the first matched email for provenance.
  const peopleById = new Map<string, CandidatePerson>()
  for (const p of input.candidatePeople) {
    if (!peopleById.has(p.person_id)) peopleById.set(p.person_id, p)
  }
  const people = [...peopleById.values()]
  if (people.length === 0) return []

  const distinctClients = new Set(people.map(p => p.client_id))
  const confidence: 'high' | 'ambiguous' =
    people.length === 1 && distinctClients.size === 1 ? 'high' : 'ambiguous'

  const proposals: TargetProposal[] = people.map((p) => {
    // Open opps for this person, then (fallback) for this person's company.
    const personOpps = input.candidateOpps
      .filter(o => o.person_id === p.person_id && o.client_id === p.client_id)
      .sort(byUpdatedDesc)
    const companyOpps = p.company_id
      ? input.candidateOpps
          .filter(o => o.person_id === null && o.company_id === p.company_id && o.client_id === p.client_id)
          .sort(byUpdatedDesc)
      : []
    const rankedOpps = personOpps.length ? personOpps : companyOpps

    const personRef: TargetRef = {
      client_id: p.client_id, target_type: 'person', target_id: p.person_id, label: p.display_name || p.email,
    }
    const companyRef: TargetRef | null = p.company_id
      ? { client_id: p.client_id, target_type: 'company', target_id: p.company_id, label: p.company_name || 'Company' }
      : null

    let primary: TargetRef
    const alternatives: TargetRef[] = []
    if (rankedOpps.length) {
      const [best, ...rest] = rankedOpps
      primary = { client_id: p.client_id, target_type: 'opportunity', target_id: best.opportunity_id, label: best.name }
      alternatives.push(personRef)
      if (companyRef) alternatives.push(companyRef)
      for (const o of rest) {
        alternatives.push({ client_id: p.client_id, target_type: 'opportunity', target_id: o.opportunity_id, label: o.name })
      }
    } else {
      primary = personRef
      if (companyRef) alternatives.push(companyRef)
    }

    return { ...primary, matched_email: p.email, person_id: p.person_id, confidence, alternatives }
  })

  // Deterministic order: opp-bearing proposals first, then by label.
  return proposals.sort((a, b) => {
    const ao = a.target_type === 'opportunity' ? 0 : 1
    const bo = b.target_type === 'opportunity' ? 0 : 1
    return ao - bo || a.label.localeCompare(b.label)
  })
}

export interface ActionItemForBridge {
  id: string
  meeting_session_id: string
  meeting_title: string
  source_artifact_id: string | null
  content: string
  due_at: string | null
}

export interface CrmTaskPayload {
  client_id: string
  target_type: 'opportunity' | 'person' | 'company'
  target_id: string
  title: string
  description: string
  task_type: 'meeting'
  priority: (typeof TASK_PRIORITIES)[number]
  due_at: string | null
}

export function buildCrmTaskPayload(
  actionItem: ActionItemForBridge,
  target: { client_id: string, target_type: 'opportunity' | 'person' | 'company', target_id: string },
  opts: { priority?: (typeof TASK_PRIORITIES)[number] } = {},
): CrmTaskPayload {
  const description = [
    `Source: Office meeting "${actionItem.meeting_title}"`,
    '',
    actionItem.content,
    '',
    `Meeting ID: ${actionItem.meeting_session_id}`,
    `Action item ID: ${actionItem.id}`,
    actionItem.source_artifact_id ? `Artifact ID: ${actionItem.source_artifact_id}` : null,
  ].filter(Boolean).join('\n')

  return {
    client_id: target.client_id,
    target_type: target.target_type,
    target_id: target.target_id,
    title: actionItem.content.slice(0, 255),
    description,
    task_type: 'meeting',
    priority: opts.priority ?? 'medium',
    due_at: actionItem.due_at ?? null,
  }
}

// ── DB layer ─────────────────────────────────────────────────────────────────

// Cross-client by design: agency staff resolve a meeting against every client's
// contacts (the meeting carries no client_id). Tenant isolation is enforced at
// conversion (the chosen target's client_id is authoritative).
export async function findMeetingCrmCandidates(meetingSessionId: string): Promise<{
  candidatePeople: CandidatePerson[]
  candidateOpps: CandidateOpp[]
}> {
  const people = await queryRows<CandidatePerson>(
    `SELECT p.id AS person_id, p.client_id, p.company_id,
            co.name AS company_name,
            lower(trim(p.email)) AS email,
            trim(concat_ws(' ', p.first_name, p.last_name)) AS display_name
     FROM office_meeting_sessions s
     CROSS JOIN LATERAL unnest(s.guest_emails) AS ge(email)
     JOIN crm_people p
       ON p.deleted_at IS NULL
      AND p.email IS NOT NULL
      AND lower(trim(p.email)) = lower(trim(ge.email))
     LEFT JOIN crm_companies co ON co.id = p.company_id AND co.deleted_at IS NULL
     WHERE s.id = $1`,
    [meetingSessionId],
  )
  if (people.length === 0) return { candidatePeople: [], candidateOpps: [] }

  const personIds = [...new Set(people.map(p => p.person_id))]
  const companyIds = [...new Set(people.map(p => p.company_id).filter(Boolean))] as string[]

  const opps = await queryRows<CandidateOpp>(
    `SELECT id AS opportunity_id, client_id, person_id, company_id, name,
            to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
     FROM crm_opportunities
     WHERE status = 'open' AND deleted_at IS NULL
       AND ( person_id = ANY($1::uuid[])
             OR (person_id IS NULL AND company_id = ANY($2::uuid[])) )`,
    // Postgres ANY() rejects an empty array — use a nil UUID that never matches.
    [personIds, companyIds.length ? companyIds : ['00000000-0000-0000-0000-000000000000']],
  )
  return { candidatePeople: people, candidateOpps: opps }
}

export type BridgeMode = 'manual_office' | 'manual_crm' | 'auto'

export interface ConvertResult {
  task: Record<string, unknown>
  actionItem: Record<string, unknown>
  created: boolean
}

// Thrown only on the genuine concurrent-double-convert race (the pre-flight
// crm_task_id check passed for two callers at once and one lost the in-txn guard).
// Callers should treat it as "already converted" — endpoints return 409, the cron
// counts it as a skip — not a 500.
export class AlreadyConvertedError extends Error {
  constructor() {
    super('action_item_already_converted')
    this.name = 'AlreadyConvertedError'
  }
}

// Idempotent: if the action item already has a crm_task_id, return the existing
// task untouched. Otherwise insert the crm_task, stamp the action item, and write
// an audit row — all in one transaction.
export async function convertActionItemToCrmTask(
  actionItem: ActionItemForBridge & { crm_task_id: string | null },
  target: { client_id: string, target_type: 'opportunity' | 'person' | 'company', target_id: string },
  opts: { actor: string | null, mode: BridgeMode, priority?: (typeof TASK_PRIORITIES)[number] },
): Promise<ConvertResult> {
  if (actionItem.crm_task_id) {
    // Re-read both rows so the idempotent return reflects current DB state, not
    // the caller's (possibly pre-stamp) in-memory snapshot.
    const [existing, currentAi] = await Promise.all([
      queryOne(`SELECT * FROM crm_tasks WHERE id = $1`, [actionItem.crm_task_id]),
      queryOne(`SELECT * FROM office_meeting_action_items WHERE id = $1`, [actionItem.id]),
    ])
    return {
      task: existing as Record<string, unknown>,
      actionItem: currentAi as Record<string, unknown>,
      created: false,
    }
  }

  const payload = buildCrmTaskPayload(actionItem, target, { priority: opts.priority })

  const result = await transaction(async (client) => {
    const taskRes = await client.query(
      `INSERT INTO crm_tasks
         (client_id, target_type, target_id, title, description, task_type, priority, due_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [payload.client_id, payload.target_type, payload.target_id, payload.title,
       payload.description, payload.task_type, payload.priority, payload.due_at, opts.actor],
    )
    const task = taskRes.rows[0]

    const aiRes = await client.query(
      `UPDATE office_meeting_action_items
       SET crm_task_id = $1,
           metadata = metadata || $2::jsonb,
           updated_at = now()
       WHERE id = $3 AND crm_task_id IS NULL
       RETURNING *`,
      [task.id, JSON.stringify({
        crm_task_id: task.id,
        crm_task_created_at: new Date().toISOString(),
        crm_bridge_mode: opts.mode,
      }), actionItem.id],
    )
    // Lost-race guard: another tx stamped it first → roll back our insert.
    if (aiRes.rowCount === 0) {
      throw new AlreadyConvertedError()
    }
    return { task, actionItem: aiRes.rows[0] }
  })

  // Best-effort audit (never rolls back the conversion).
  try {
    await recordFieldChanges({
      clientId: target.client_id,
      entityType: 'crm_task',
      entityId: result.task.id as string,
      before: null,
      after: { created_from_meeting: actionItem.id },
      fields: ['created_from_meeting'],
      actor: opts.actor,
    })
  } catch (e) {
    console.warn('[meetingBridge] audit write failed:', e)
  }

  return { ...result, created: true }
}

export type SkipReason = 'ambiguous_multi_person' | 'ambiguous_multi_client' | 'no_crm_match'

export async function recordSkipReason(actionItemId: string, reason: SkipReason): Promise<void> {
  await execute(
    `UPDATE office_meeting_action_items
     SET metadata = metadata || $2::jsonb, updated_at = now()
     WHERE id = $1`,
    [actionItemId, JSON.stringify({ crm_skip_reason: reason, crm_skip_at: new Date().toISOString() })],
  )
}
