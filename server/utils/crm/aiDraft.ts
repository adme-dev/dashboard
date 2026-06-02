// server/utils/crm/aiDraft.ts
// Auto-drafted follow-up for a stalled deal (P4.3). Groq writes the TEXT; the
// prompt is assembled deterministically (buildDraftPrompt is pure/TDD). The
// draft is a SUGGESTION only — the rep edits/accepts/dismisses; nothing is sent.
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

export interface DraftContext {
  contactName: string | null
  companyName: string | null
  oppTitle: string | null
  stageName: string | null
  amount: number | null
  daysSinceLastActivity: number | null
  daysSinceLastComm: number | null
  senderName: string | null
}

export interface FollowUpDraft {
  subject: string
  body: string
}

// Pure — assembles the deal context into a grounded prompt. Instructs the model
// to use ONLY the given facts (no fabrication) and to return JSON.
export function buildDraftPrompt(c: DraftContext): string {
  const facts: string[] = []
  if (c.contactName) facts.push(`Contact: ${c.contactName}`)
  if (c.companyName) facts.push(`Company: ${c.companyName}`)
  if (c.oppTitle) facts.push(`Deal: ${c.oppTitle}`)
  if (c.stageName) facts.push(`Pipeline stage: ${c.stageName}`)
  if (c.amount != null) facts.push(`Deal value: ${c.amount}`)
  if (c.daysSinceLastActivity != null) facts.push(`Days since last activity: ${c.daysSinceLastActivity}`)
  if (c.daysSinceLastComm != null) facts.push(`Days since last contact: ${c.daysSinceLastComm}`)
  if (c.senderName) facts.push(`Sender (rep): ${c.senderName}`)

  return [
    'Draft a short, warm, professional follow-up email to re-engage a stalled sales deal.',
    'Use ONLY the facts below — do not invent prices, dates, names, or commitments.',
    'Keep it under 120 words, with a clear, low-pressure call to action.',
    '',
    'Facts:',
    facts.length ? facts.map(f => `- ${f}`).join('\n') : '- (minimal context available)',
    '',
    'Respond with strict JSON only: {"subject": "...", "body": "..."}',
  ].join('\n')
}

// Best-effort JSON extraction (model may wrap in prose or a code fence).
function parseDraft(raw: string, c: DraftContext): FollowUpDraft {
  const fence = raw.match(/\{[\s\S]*\}/)
  if (fence) {
    try {
      const j = JSON.parse(fence[0]) as { subject?: unknown, body?: unknown }
      const subject = typeof j.subject === 'string' ? j.subject.trim() : ''
      const body = typeof j.body === 'string' ? j.body.trim() : ''
      if (body) return { subject: subject || `Following up${c.oppTitle ? `: ${c.oppTitle}` : ''}`, body }
    } catch { /* fall through */ }
  }
  return { subject: `Following up${c.oppTitle ? `: ${c.oppTitle}` : ''}`, body: raw.trim() }
}

export async function draftFollowUp(c: DraftContext): Promise<FollowUpDraft> {
  const raw = await generateGroqInsight(buildDraftPrompt(c), {
    model: GROQ_MODELS.LLAMA_70B,
    temperature: 0.4,
    maxTokens: 600,
    systemPrompt: 'You are a sales rep writing concise, genuine follow-up emails. Respond in valid JSON only.',
  })
  return parseDraft(raw, c)
}
