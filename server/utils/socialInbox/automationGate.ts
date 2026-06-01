// server/utils/socialInbox/automationGate.ts
// Master kill-switch for the reply automation engine. Mirrors the email EMAIL_SENDING_ENABLED
// precedent: the engine drafts/queues/sends NOTHING unless this is the exact string "true".
// The on-demand "AI draft" suggest endpoint is exempt (explicit human action).
export function isSocialAutomationEnabled(): boolean {
  return process.env.SOCIAL_AUTOMATION_ENABLED === 'true'
}
