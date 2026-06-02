// server/utils/crm/aiSignals.ts
// Gathers the opportunity context the CRM AI layer (P4.3) reasons over — shared
// by the next-best-action and draft-followup endpoints. I/O only; the decisions
// live in nextBestAction.ts (pure) and aiDraft.ts.
import { queryOne } from '~~/server/utils/db'
import type { OppSignals } from './nextBestAction'
import type { DraftContext } from './aiDraft'

export interface OppContext {
  signals: OppSignals
  draft: DraftContext
}

const dayDiff = (iso: string | null, now: Date): number | null =>
  iso === null ? null : Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000)

export async function gatherOppContext(clientId: string, oppId: string, now: Date = new Date()): Promise<OppContext | null> {
  const opp = await queryOne<{
    name: string, status: 'open' | 'won' | 'lost', amount: string,
    person_id: string | null, company_id: string | null, created_at: string,
    stage_name: string | null, stage_is_won: boolean, stage_is_lost: boolean
  }>(
    `SELECT o.name, o.status, o.amount::text AS amount, o.person_id, o.company_id,
            o.created_at::text AS created_at,
            s.name AS stage_name, s.is_won AS stage_is_won, s.is_lost AS stage_is_lost
       FROM crm_opportunities o
       LEFT JOIN crm_stages s ON s.id = o.stage_id
      WHERE o.id = $1 AND o.client_id = $2 AND o.deleted_at IS NULL`,
    [oppId, clientId],
  )
  if (!opp) return null

  const tasks = await queryOne<{ open_cnt: string, overdue_cnt: string }>(
    `SELECT COUNT(*)::text AS open_cnt,
            COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at < NOW())::text AS overdue_cnt
       FROM crm_tasks
      WHERE client_id = $1 AND target_type = 'opportunity' AND target_id = $2 AND deleted_at IS NULL
        AND status IN ('pending','in_progress')`,
    [clientId, oppId],
  )
  const act = await queryOne<{ last_at: string | null }>(
    `SELECT MAX(COALESCE(scheduled_at, created_at))::text AS last_at FROM crm_activities
      WHERE client_id = $1 AND target_type = 'opportunity' AND target_id = $2 AND deleted_at IS NULL`,
    [clientId, oppId],
  )

  let lastCommAt: string | null = null
  let leadScore: number | null = null
  let contactName: string | null = null
  let companyName: string | null = null

  if (opp.person_id) {
    const pc = await queryOne<{ last_at: string | null }>(
      `SELECT MAX(occurred_at)::text AS last_at FROM crm_communications WHERE client_id = $1 AND person_id = $2 AND deleted_at IS NULL`,
      [clientId, opp.person_id])
    lastCommAt = pc?.last_at ?? null
    const ps = await queryOne<{ total_score: number }>(
      `SELECT total_score FROM crm_scores WHERE client_id = $1 AND target_type = 'person' AND target_id = $2 AND score_type = 'lead'`,
      [clientId, opp.person_id])
    leadScore = ps ? Number(ps.total_score) : null
    const pn = await queryOne<{ nm: string | null }>(
      `SELECT NULLIF(TRIM(first_name || ' ' || COALESCE(last_name, '')), '') AS nm FROM crm_people WHERE id = $1 AND client_id = $2`,
      [opp.person_id, clientId])
    contactName = pn?.nm ?? null
  }
  if (opp.company_id) {
    const cn = await queryOne<{ name: string | null }>(
      `SELECT name FROM crm_companies WHERE id = $1 AND client_id = $2`, [opp.company_id, clientId])
    companyName = cn?.name ?? null
    if (lastCommAt === null) {
      const cc = await queryOne<{ last_at: string | null }>(
        `SELECT MAX(occurred_at)::text AS last_at FROM crm_communications WHERE client_id = $1 AND company_id = $2 AND deleted_at IS NULL`,
        [clientId, opp.company_id])
      lastCommAt = cc?.last_at ?? null
    }
    if (leadScore === null) {
      const cs = await queryOne<{ total_score: number }>(
        `SELECT total_score FROM crm_scores WHERE client_id = $1 AND target_type = 'company' AND target_id = $2 AND score_type = 'lead'`,
        [clientId, opp.company_id])
      leadScore = cs ? Number(cs.total_score) : null
    }
  }

  const daysSinceLastActivity = dayDiff(act?.last_at ?? null, now)
  const daysSinceLastComm = dayDiff(lastCommAt, now)

  const signals: OppSignals = {
    status: opp.status,
    stageName: opp.stage_name,
    stageIsWon: !!opp.stage_is_won,
    stageIsLost: !!opp.stage_is_lost,
    daysSinceLastActivity,
    daysSinceCreated: dayDiff(opp.created_at, now) ?? 0,
    openTaskCount: Number(tasks?.open_cnt ?? 0),
    overdueTaskCount: Number(tasks?.overdue_cnt ?? 0),
    daysSinceLastComm,
    leadScore,
  }
  const draft: DraftContext = {
    contactName,
    companyName,
    oppTitle: opp.name,
    stageName: opp.stage_name,
    amount: Number(opp.amount),
    daysSinceLastActivity,
    daysSinceLastComm,
    senderName: null,
  }
  return { signals, draft }
}
