// server/utils/socialPublishing/plannerGate.ts
// Flags for the Planner campaign board + AI generation. Both default OFF (exact string "true").
// Mirrors SOCIAL_AUTOMATION_ENABLED precedent — the surface is dormant until an operator flips it.
export function isPlannerEnabled(): boolean {
  return process.env.SOCIAL_PLANNER_ENABLED === 'true'
}
export function isPlannerAiEnabled(): boolean {
  return process.env.SOCIAL_PLANNER_AI_ENABLED === 'true'
}
