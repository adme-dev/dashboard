// server/api/cron/crm-meeting-actions.post.ts
// P4.3b auto-convert — turn eligible unconverted office-meeting action items into
// CRM tasks. Triggered by the workers/crm-cron companion Worker (Nitro Pages has
// no scheduled() handler).
//
// DOUBLY gated + flood-guarded, dormant by default:
//   - CRM_AI_ENABLED must be 'true'
//   - per-client opt-in: crm_settings.meeting_bridge_autocreate = true
//   - since-deploy cutoff: only action items created after the client's
//     meeting_bridge_enabled_at convert (no first-run backlog flood)
// Only unambiguous single-person/single-client matches convert; multi/zero
// matches record a structured crm_skip_reason and are left alone (never guess).
//
// Auth: x-cron-secret matched against CRON_SECRET (skipped in dev).
import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import {
  findMeetingCrmCandidates, rankTargets, convertActionItemToCrmTask, recordSkipReason,
  authorizeMeetingCandidatesForTrustedSystem, AlreadyConvertedError,
} from '~~/server/utils/crm/meetingBridge'
import { resolveTrustedCrmSystemContext } from '~~/server/utils/crm/searchContext'

interface CandidateItem {
  id: string
  meeting_session_id: string
  content: string
  due_at: string | null
  source_artifact_id: string | null
  meeting_title: string
  created_ms: number
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (process.env.CRM_AI_ENABLED !== 'true') {
    return { skipped: 'flag_disabled', converted: 0 }
  }

  // Opt-in clients with an enable timestamp (the since-deploy cutoff).
  const optIns = await queryRows<{ client_id: string, enabled_ms: string | number }>(
    `SELECT client_id, extract(epoch from meeting_bridge_enabled_at) * 1000 AS enabled_ms
     FROM crm_settings
     WHERE meeting_bridge_autocreate = true AND meeting_bridge_enabled_at IS NOT NULL`,
  )
  if (optIns.length === 0) return { skipped: 'no_optin_clients', converted: 0 }

  const cutoffByClient = new Map(optIns.map(o => [o.client_id, Number(o.enabled_ms)]))
  const earliestCutoffMs = Math.min(...cutoffByClient.values())

  // Candidate action items: unconverted, not yet skipped, created after the
  // earliest opt-in cutoff. Per-client cutoff is re-checked after resolution.
  const items = await queryRows<CandidateItem>(
    `SELECT omai.id, omai.meeting_session_id, omai.content, omai.due_at,
            omai.source_artifact_id, oms.title AS meeting_title,
            extract(epoch from omai.created_at) * 1000 AS created_ms
     FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     WHERE omai.crm_task_id IS NULL
       AND (omai.metadata ->> 'crm_skip_reason') IS NULL
       AND extract(epoch from omai.created_at) * 1000 >= $1
     ORDER BY omai.created_at ASC
     LIMIT 200`,
    [earliestCutoffMs],
  )

  let converted = 0
  let skipped = 0
  let failed = 0
  // Resolution is by meeting guest_emails (stable per meeting within a sweep), so
  // cache it — many action items share one meeting_session_id.
  const candidateCache = new Map<string, ReturnType<typeof rankTargets>>()
  for (const item of items) {
    let proposals = candidateCache.get(item.meeting_session_id)
    if (!proposals) {
      proposals = rankTargets(await authorizeMeetingCandidatesForTrustedSystem(
        await findMeetingCrmCandidates(item.meeting_session_id)
      ))
      candidateCache.set(item.meeting_session_id, proposals)
    }
    if (proposals.length === 0) { await recordSkipReason(item.id, 'no_crm_match'); skipped++; continue }
    const distinctClients = new Set(proposals.map(p => p.client_id))
    if (distinctClients.size > 1) { await recordSkipReason(item.id, 'ambiguous_multi_client'); skipped++; continue }
    if (proposals.length > 1) { await recordSkipReason(item.id, 'ambiguous_multi_person'); skipped++; continue }

    // Single person + single client past the checks above ⇒ confidence is 'high'.
    const p = proposals[0]!

    // Per-client opt-in + since-deploy cutoff (the matched client, not the meeting's).
    const cutoffMs = cutoffByClient.get(p.client_id)
    if (cutoffMs === undefined) {
      // Resolved to a client that hasn't opted in. It will never become eligible
      // (a later opt-in stamps enabled_at=now(), leaving this item pre-cutoff), so
      // stamp it out of future scans to avoid starving newer items.
      await recordSkipReason(item.id, 'client_not_opted_in'); skipped++; continue
    }
    // Pre-cutoff items stay unstamped (rescannable) — intentional flood guard.
    if (Number(item.created_ms) < cutoffMs) { skipped++; continue }

    try {
      const accessContext = await resolveTrustedCrmSystemContext({
        clientId: p.client_id,
        purpose: 'crm_meeting_action'
      })
      await convertActionItemToCrmTask(
        {
          id: item.id, meeting_session_id: item.meeting_session_id, meeting_title: item.meeting_title,
          source_artifact_id: item.source_artifact_id, content: item.content, due_at: item.due_at, crm_task_id: null,
        },
        { client_id: p.client_id, target_type: p.target_type, target_id: p.target_id },
        { actor: null, mode: 'auto', accessContext },
      )
      converted++
    } catch (e) {
      // A lost race (another path converted it first) is a clean skip; anything
      // else is logged and counted but never aborts the sweep.
      if (e instanceof AlreadyConvertedError) { skipped++ }
      else { console.warn('[crm-meeting-actions] convert failed', safeError(e)); failed++ }
    }
  }
  const result = { converted, skipped, failed, scanned: items.length }
  console.log('[crm-cron] meeting-actions', result)
  return result
})

function safeError(error: unknown) {
  return error instanceof Error ? error.message : 'unknown_error'
}
