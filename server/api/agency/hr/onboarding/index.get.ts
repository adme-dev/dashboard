import { setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { queryOne } from '~~/server/utils/db'

type OnboardingRow = {
  id: string
  status: 'draft' | 'completed' | 'archived'
  current_step: number
  answers: Record<string, unknown>
  consented_sources: string[]
  completed_at: string | null
  created_at: string
  updated_at: string
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)

  const session = await queryOne<OnboardingRow>(
    `SELECT id, status, current_step, answers, consented_sources,
            completed_at, created_at, updated_at
     FROM hr_owner_onboarding_sessions
     WHERE owner_id = $1 AND status <> 'archived'
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.id],
  )

  await recordHrAuditEvent({
    actorId: user.id,
    action: 'owner_onboarding.viewed',
    targetType: 'owner_onboarding_session',
    targetId: session?.id,
  })

  return {
    session: session
      ? {
          id: session.id,
          status: session.status,
          currentStep: session.current_step,
          answers: session.answers,
          consentedSources: session.consented_sources,
          completedAt: session.completed_at,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
        }
      : null,
    privacy: {
      visibility: 'business_owner_only',
      privateMessagesExcluded: true,
      automatedEmploymentDecisions: false,
    },
  }
})
