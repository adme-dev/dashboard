/**
 * Client-safe persona options for the AI chat picker (Slice 1.5). The server can't be imported into
 * the browser bundle, so the list is mirrored here; `test/ai/personas.test.ts` asserts key + label
 * parity against the server source of truth (server/utils/ai/personas.ts) so the two can't drift.
 */
export interface AiPersonaOption {
  key: string
  label: string
  description: string
}

export const AI_PERSONA_OPTIONS: AiPersonaOption[] = [
  { key: 'general', label: 'Agency Assistant', description: 'General-purpose — every tool your role allows.' },
  { key: 'finance', label: 'Finance', description: 'Cash, P&L, invoicing, ad-spend efficiency and anomalies.' },
  { key: 'marketing', label: 'Marketing', description: 'Ad-spend pacing, social performance, briefs and delivery.' },
  { key: 'sales', label: 'Sales', description: 'Client overview, briefs/opportunities and account risks.' },
  { key: 'account', label: 'Account Management', description: 'Client delivery — projects, tasks, briefs and social.' },
]
