// server/utils/crm/aiConfig.ts
// The CRM AI layer (P4.3) is OFF unless the operator sets CRM_AI_ENABLED='true'.
// Off by default — every AI endpoint short-circuits when this is false, and the
// UI hides the AI panel. Also needs a Groq key to actually produce drafts.
export function isCrmAiEnabled(): boolean {
  return process.env.CRM_AI_ENABLED === 'true'
}
