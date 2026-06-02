// server/utils/crm/meetingBridge.ts
// Deterministic resolution of office-meeting guests → CRM targets, plus the
// pure CRM-task payload builder. DB-touching helpers live below the pure block.
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
