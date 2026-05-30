// server/utils/xeroReconcileAI.ts
/**
 * AI grouping of unrepresented Xero customers into existing or new group
 * clients, via Groq. parseAiGrouping is pure + validated (unit-tested);
 * aiGroupCandidates wraps the live Groq call.
 */
import getGroqClient, { GROQ_MODELS } from './groqClient'
import type { ClientRef } from './xeroReconcile'

export interface AiGroupingItem {
  contactId: string
  xeroName: string
  decision: 'existing' | 'new_group'
  clientId?: string
  proposedGroupName?: string
  confidence: number
  reason: string
}

/** Parse + validate the model's JSON. Invalid existing-client refs are demoted
 *  to new_group (flagged, confidence 0). Throws if the payload is unparseable. */
export function parseAiGrouping(raw: string, validClientIds: Set<string>): AiGroupingItem[] {
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim()
  let obj: any
  try { obj = JSON.parse(cleaned) } catch { throw new Error('AI returned unparseable JSON') }
  const items = Array.isArray(obj) ? obj : obj.items
  if (!Array.isArray(items)) throw new Error('AI response missing items array')

  return items
    .map((it: any): AiGroupingItem | null => {
      const contactId = String(it?.contactId ?? '')
      if (!contactId) return null
      const xeroName = String(it?.xeroName ?? '')
      const confidence = typeof it?.confidence === 'number' ? Math.max(0, Math.min(1, it.confidence)) : 0.5
      const reason = String(it?.reason ?? '')

      if (it?.decision === 'existing') {
        const clientId = String(it?.clientId ?? '')
        if (clientId && validClientIds.has(clientId)) {
          return { contactId, xeroName, decision: 'existing', clientId, confidence, reason }
        }
        // Unknown client reference → demote to new_group, flagged.
        return {
          contactId, xeroName, decision: 'new_group',
          proposedGroupName: it?.proposedGroupName ? String(it.proposedGroupName) : xeroName,
          confidence: 0, reason: reason || 'AI referenced an unknown client; needs review'
        }
      }
      return {
        contactId, xeroName, decision: 'new_group',
        proposedGroupName: it?.proposedGroupName ? String(it.proposedGroupName) : xeroName,
        confidence, reason
      }
    })
    .filter((x): x is AiGroupingItem => x !== null)
}

const SYSTEM_PROMPT = `You are an entity-resolution assistant for an Australian car-dealership marketing agency. ` +
  `Brands such as KIA, MG, GWM, Haval, Nissan, Isuzu, Subaru, Renault, LDV, Ssangyong/KGM are sub-brands of a dealer ` +
  `GROUP identified by a location (e.g. "Northern", "Brighton") or an owner name. Acronyms occur (e.g. GWS = Garry and ` +
  `Warren Smith). Respond ONLY with valid JSON.`

export async function aiGroupCandidates(
  candidates: { contactId: string; name: string }[],
  clients: ClientRef[]
): Promise<AiGroupingItem[]> {
  const validIds = new Set(clients.map((c) => c.id))
  const user = [
    'Existing group-level clients:',
    ...clients.map((c) => `- ${c.name} [${c.id}]`),
    '',
    'Unmatched Xero customers to assign:',
    ...candidates.map((c) => `- ${c.name} [${c.contactId}]`),
    '',
    'For EACH Xero customer return an item. Use an existing client when the customer clearly belongs to one ' +
    '(decision:"existing", clientId set to its [id]); otherwise propose a new group (decision:"new_group", ' +
    'proposedGroupName as a clean group name). Respond as JSON: ' +
    '{"items":[{"contactId","xeroName","decision","clientId","proposedGroupName","confidence","reason"}]}.'
  ].join('\n')

  const groq = getGroqClient()
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user }
    ],
    model: GROQ_MODELS.LLAMA_70B,
    temperature: 0.1,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    stream: false
  })
  const content = completion.choices[0]?.message?.content || ''
  return parseAiGrouping(content, validIds)
}
