/**
 * Convert Brief to Project
 * POST /api/agency/briefs/:id/convert
 *
 * Body:
 * - projectTemplateId?: UUID - override template to use
 * - projectName?: string - override project name (default: brief title)
 * - startDate?: string - project start date (default: today)
 * - clientId?: string - override client (default: brief's client)
 */

import { requireAuth } from '~~/server/utils/auth'
import { convertBriefToProject } from '~~/server/utils/briefConversion'
import { maybeAcknowledgeBrief } from '~~/server/utils/automation/actionedConfirmationRunner'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const briefId = getRouterParam(event, 'id')

  if (!briefId) {
    throw createError({ statusCode: 400, statusMessage: 'Brief ID is required' })
  }

  const body = await readBody(event)

  try {
    const result = await convertBriefToProject({
      briefId,
      userId: user.id,
      projectTemplateId: body?.projectTemplateId || null,
      projectName: body?.projectName || null,
      startDate: body?.startDate || null,
      clientId: body?.clientId || null
    })

    // C7: a converted brief counts as actioned (flag-gated, fail-open).
    await maybeAcknowledgeBrief(briefId)

    return {
      success: true,
      project: result.project,
      tasksCreated: result.tasksCreated,
      budgetAllocationsCreated: result.budgetAllocationsCreated ?? 0,
      gatekeeper: result.gatekeeper ?? null,
      message: `Created project "${result.project.name}" with ${result.tasksCreated} tasks`
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('[Brief] Convert failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to convert brief to project'
    })
  }
})
