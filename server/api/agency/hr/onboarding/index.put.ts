import { createError, readBody, setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { hrOwnerOnboardingSchema } from '~~/server/utils/hr/schemas'
import { transaction } from '~~/server/utils/db'

type SavedSession = {
  id: string
  status: 'draft' | 'completed'
  current_step: number
  completed_at: string | null
  updated_at: string
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const parsed = hrOwnerOnboardingSchema.safeParse(await readBody(event))

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid HR onboarding answers',
      data: { issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) },
    })
  }

  const input = parsed.data
  const session = await transaction(async (db) => {
    let saved: SavedSession | null = null
    if (input.sessionId) {
      const result = await db.query(
        `UPDATE hr_owner_onboarding_sessions
       SET status = $3,
           current_step = $4,
           answers = $5::jsonb,
           consented_sources = $6::jsonb,
           completed_at = CASE WHEN $3 = 'completed' THEN COALESCE(completed_at, NOW()) ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1 AND owner_id = $2 AND status <> 'archived'
       RETURNING id, status, current_step, completed_at, updated_at`,
        [
          input.sessionId,
          user.id,
          input.status,
          input.currentStep,
          JSON.stringify(input.answers),
          JSON.stringify(input.consentedSources),
        ],
      )
      saved = result.rows[0] || null
      if (!saved) throw createError({ statusCode: 404, statusMessage: 'HR onboarding session not found' })
    } else {
      const existingResult = await db.query(
        `SELECT id FROM hr_owner_onboarding_sessions
       WHERE owner_id = $1 AND status <> 'archived'
       ORDER BY created_at DESC LIMIT 1`,
        [user.id],
      )
      if (existingResult.rows[0]) throw createError({ statusCode: 409, statusMessage: 'An HR onboarding session already exists' })
      const result = await db.query(
        `INSERT INTO hr_owner_onboarding_sessions
        (owner_id, status, current_step, answers, consented_sources, completed_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb,
               CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END)
       RETURNING id, status, current_step, completed_at, updated_at`,
        [
          user.id,
          input.status,
          input.currentStep,
          JSON.stringify(input.answers),
          JSON.stringify(input.consentedSources),
        ],
      )
      saved = result.rows[0] || null
    }
    if (!saved) throw createError({ statusCode: 500, statusMessage: 'Failed to save HR onboarding session' })
    if (input.status === 'completed') {
      await db.query(
        `INSERT INTO hr_business_context_versions
        (onboarding_session_id, version, content, status, published_by, published_at)
       VALUES ($1, 1, $2::jsonb, 'published', $3, NOW())
       ON CONFLICT (onboarding_session_id, version)
       DO UPDATE SET content = EXCLUDED.content,
                     status = 'published',
                     published_by = EXCLUDED.published_by,
                     published_at = NOW()
       RETURNING id`,
        [saved.id, JSON.stringify(input.answers), user.id],
      )
    }
    await recordHrAuditEvent({
      actorId: user.id,
      action: input.status === 'completed' ? 'owner_onboarding.completed' : 'owner_onboarding.saved',
      targetType: 'owner_onboarding_session',
      targetId: saved.id,
      metadata: { currentStep: input.currentStep, sourceCount: input.consentedSources.length },
    }, db)
    return saved
  })

  return {
    ok: true,
    session: {
      id: session.id,
      status: session.status,
      currentStep: session.current_step,
      completedAt: session.completed_at,
      updatedAt: session.updated_at,
    },
  }
})
