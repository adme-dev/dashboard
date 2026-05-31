// server/utils/crm/stages.ts
export interface StageRow {
  id: string
  client_id: string | null
  code: string
  sort_order: number
  [k: string]: unknown
}

// If the client has ANY custom stages, use those exclusively; otherwise fall back to globals.
export function resolveStages(globals: StageRow[], clientStages: StageRow[]): StageRow[] {
  const chosen = clientStages.length ? clientStages : globals
  return [...chosen].sort((a, b) => a.sort_order - b.sort_order)
}
