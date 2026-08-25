import { z } from 'zod'

/** Competition set-up, permit rules and the T&Cs generator. Shared by the editor, the API and the public entry flow. */
export const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'] as const
export type AuState = typeof AU_STATES[number]

export const CompetitionDetailsSchema = z.object({
  promoter: z.object({
    legal_name: z.string().trim().max(160).default(''),
    abn: z.string().trim().regex(/^(\d{2} ?\d{3} ?\d{3} ?\d{3})?$/, 'ABN is 11 digits').default(''),
    address: z.string().trim().max(240).default(''),
    contact_email: z.string().trim().max(160).default(''),
    contact_phone: z.string().trim().max(40).default('')
  }).default({ legal_name: '', abn: '', address: '', contact_email: '', contact_phone: '' }),
  prize_summary: z.string().trim().max(300).default(''),
  prize_items: z.array(z.object({ name: z.string().trim().min(1).max(160), value: z.number().min(0).max(10_000_000), quantity: z.number().int().min(1).max(10_000).default(1) })).max(50).default([]),
  entry_method: z.string().trim().max(600).default('Scan the QR code and complete the entry form.'),
  eligibility: z.object({
    min_age: z.number().int().min(0).max(25).default(18),
    states: z.array(z.enum(AU_STATES)).default([...AU_STATES]),
    exclude_staff: z.boolean().default(true),
    max_entries_per_person: z.number().int().min(1).max(100).default(1),
    residents_only: z.boolean().default(true)
  }).default({ min_age: 18, states: [...AU_STATES], exclude_staff: true, max_entries_per_person: 1, residents_only: true }),
  judging_criteria: z.string().trim().max(1200).default(''),
  skill_question: z.string().trim().max(240).default('In 25 words or less, tell us…'),
  draw: z.object({
    at: z.string().trim().max(60).default(''),
    venue: z.string().trim().max(240).default(''),
    method: z.string().trim().max(300).default('Random computerised draw'),
    winners: z.number().int().min(1).max(1000).default(1),
    reserves: z.number().int().min(0).max(1000).default(2),
    notify_within_days: z.number().int().min(1).max(30).default(2),
    publish_where: z.string().trim().max(240).default(''),
    unclaimed_after_days: z.number().int().min(7).max(365).default(90)
  }).default({ at: '', venue: '', method: 'Random computerised draw', winners: 1, reserves: 2, notify_within_days: 2, publish_where: '', unclaimed_after_days: 90 }),
  privacy_url: z.string().trim().max(2048).default(''),
  extra_terms_md: z.string().max(6000).default('')
}).strict()
export type CompetitionDetails = z.infer<typeof CompetitionDetailsSchema>

export const PermitStatus = ['not_required', 'to_apply', 'applied', 'approved', 'refused'] as const
export const PermitRowSchema = z.object({
  state: z.enum(AU_STATES),
  required: z.enum(['auto', 'yes', 'no']).default('auto'),
  status: z.enum(PermitStatus).default('not_required'),
  permit_number: z.string().trim().max(80).default(''),
  applied_at: z.string().trim().max(30).nullable().default(null),
  approved_at: z.string().trim().max(30).nullable().default(null),
  expires_at: z.string().trim().max(30).nullable().default(null),
  document_id: z.string().uuid().nullable().default(null),
  note: z.string().trim().max(400).default('')
}).strict()
export type PermitRow = z.infer<typeof PermitRowSchema>

export function totalPrizeValue(d: CompetitionDetails): number {
  return d.prize_items.reduce((n, p) => n + p.value * p.quantity, 0)
}

/**
 * Whether a trade-promotion permit is *likely* required, by state. Thresholds as at Aug 2026 —
 * the product flags, the operator confirms. Skill competitions generally need no permit.
 */
export function permitLikelyRequired(state: AuState, type: 'chance' | 'skill', total: number, opts: { scratchAndWin?: boolean, holdsOtherPermit?: boolean } = {}): { required: boolean, reason: string } {
  if (type === 'skill') return { required: false, reason: 'Game of skill — no permit for judged competitions' }
  switch (state) {
    case 'NSW': return total > 10_000 ? { required: true, reason: 'NSW authority needed when total prizes exceed $10,000' } : { required: false, reason: 'NSW: under the $10,000 authority threshold' }
    case 'ACT': return total >= 3_001 ? { required: true, reason: 'ACT permit needed for prize pools of $3,001 or more' } : { required: false, reason: 'ACT: exempt lottery under $3,001 if conditions met' }
    case 'SA': return (total > 5_000 || !!opts.scratchAndWin) ? { required: true, reason: opts.scratchAndWin ? 'SA licence needed for any scratch-and-win' : 'SA licence needed when prizes exceed $5,000' } : { required: false, reason: 'SA: under the $5,000 licence threshold' }
    case 'NT': return (total >= 5_001 && !opts.holdsOtherPermit) ? { required: true, reason: 'NT permit needed at $5,001+ unless another jurisdiction\'s permit is held' } : { required: false, reason: total >= 5_001 ? 'NT: covered by another jurisdiction\'s permit' : 'NT: under the $5,001 threshold' }
    default: return { required: false, reason: `${state}: no permit for standard draws that meet the state conditions` }
  }
}

export function defaultPermits(d: CompetitionDetails, type: 'chance' | 'skill'): PermitRow[] {
  const total = totalPrizeValue(d)
  return d.eligibility.states.map((state) => {
    const r = permitLikelyRequired(state, type, total)
    return PermitRowSchema.parse({ state, required: 'auto', status: r.required ? 'to_apply' : 'not_required', note: r.reason })
  })
}

const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** Deterministic Markdown T&Cs from structured fields. Every save should version the output. */
export function generateTerms(input: { name: string, type: 'chance' | 'skill', timezone: string, opensAt: string | null, closesAt: string | null, details: CompetitionDetails, permits: PermitRow[] }): string {
  const d = input.details
  const p = d.promoter
  const fmt = (iso: string | null) => {
    if (!iso) return 'TBC'
    try {
      return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: input.timezone }).format(new Date(iso))
    } catch {
      return iso
    }
  }
  const total = totalPrizeValue(d)
  const permitLines = input.permits.filter(r => r.permit_number).map(r => `- ${r.state}: ${r.permit_number}`)
  const states = d.eligibility.states.length === AU_STATES.length ? 'all Australian states and territories' : d.eligibility.states.join(', ')
  const lines: string[] = []
  lines.push(`# ${input.name} — Terms and Conditions`, '')
  lines.push('## 1. Promoter', `The promoter is ${p.legal_name || '[promoter legal name]'}${p.abn ? ` (ABN ${p.abn})` : ''}${p.address ? `, ${p.address}` : ''}.${p.contact_email ? ` Contact: ${p.contact_email}` : ''}${p.contact_phone ? ` / ${p.contact_phone}` : ''}`, '')
  lines.push('## 2. Eligibility', `Entry is open to ${d.eligibility.residents_only ? 'residents of ' : 'persons in '}${states} aged ${d.eligibility.min_age} years or over.${d.eligibility.exclude_staff ? ' Employees and immediate families of the promoter, its agencies and suppliers are ineligible.' : ''} Maximum ${d.eligibility.max_entries_per_person} ${d.eligibility.max_entries_per_person === 1 ? 'entry' : 'entries'} per person.`, '')
  lines.push('## 3. Promotion period', `Opens ${fmt(input.opensAt)} and closes ${fmt(input.closesAt)} (${input.timezone}). Entries received outside this period are invalid.`, '')
  lines.push('## 4. How to enter', d.entry_method, '')
  if (input.type === 'skill') lines.push('## 5. Judging', `This is a game of skill. Chance plays no part. Entries are judged on: ${d.judging_criteria || '[judging criteria]'}. The judges' decision is final and no correspondence will be entered into.`, '')
  else lines.push('## 5. Draw', `${d.draw.method}. Draw at ${d.draw.at || fmt(input.closesAt)}${d.draw.venue ? ` at ${d.draw.venue}` : ''}. ${d.draw.winners} ${d.draw.winners === 1 ? 'winner' : 'winners'} will be drawn${d.draw.reserves ? `, plus ${d.draw.reserves} reserve ${d.draw.reserves === 1 ? 'entry' : 'entries'}` : ''}. The promoter's decision is final.`, '')
  lines.push('## 6. Prizes', `${d.prize_summary || ''} Total prize pool ${money(total)}.`, ...d.prize_items.map(i => `- ${i.quantity > 1 ? `${i.quantity} × ` : ''}${i.name} — ${money(i.value)}${i.quantity > 1 ? ' each' : ''}`), 'Prizes are not transferable or exchangeable and cannot be taken as cash unless stated.', '')
  lines.push('## 7. Winner notification', `Winners will be notified within ${d.draw.notify_within_days} ${d.draw.notify_within_days === 1 ? 'day' : 'days'} of the ${input.type === 'skill' ? 'judging' : 'draw'} using the contact details provided${d.draw.publish_where ? ` and published at ${d.draw.publish_where}` : ''}.`, '')
  lines.push('## 8. Unclaimed prizes', `Prizes unclaimed after ${d.draw.unclaimed_after_days} days may be awarded to a reserve entry or otherwise dealt with as permitted by law.`, '')
  lines.push('## 9. Verification and disqualification', 'The promoter may require proof of identity, age and residency. Incomplete, automated, or ineligible entries, and entries the promoter reasonably believes breach these terms, will be disqualified.', '')
  lines.push('## 10. Privacy', `Personal information is collected to conduct the promotion and, where the entrant opts in, for marketing by the promoter.${d.privacy_url ? ` See ${d.privacy_url}.` : ''}`, '')
  lines.push('## 11. Liability and social platforms', 'To the extent permitted by law the promoter is not liable for any loss arising from participation. This promotion is not sponsored, endorsed or administered by, or associated with, any social media platform.', '')
  if (permitLines.length) lines.push('## 12. Permits', ...permitLines, '')
  if (d.extra_terms_md.trim()) lines.push('## Additional terms', d.extra_terms_md.trim(), '')
  return lines.join('\n').trim() + '\n'
}
