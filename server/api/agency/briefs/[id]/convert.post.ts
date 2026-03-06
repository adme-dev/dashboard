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

    return {
      success: true,
      project: result.project,
      tasksCreated: result.tasksCreated,
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
