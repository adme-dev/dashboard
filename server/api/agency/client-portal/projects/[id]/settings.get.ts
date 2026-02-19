/**
 * Get Client Portal Project Settings
 * GET /api/agency/client-portal/projects/:id/settings
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  try {
    // Get project with client portal settings
    const project = await queryOne(`
      SELECT
        p.id,
        p.name,
        p.client_id,
        cpp.portal_enabled,
        cpp.show_timeline,
        cpp.show_budget,
        cpp.show_tasks,
        cpp.show_files,
        cpp.show_invoices,
        cpp.allow_comments,
        cpp.allow_approvals,
        cpp.allow_file_uploads,
        cpp.notification_preferences,
        cpp.custom_branding,
        cpp.welcome_message,
        cpp.created_at,
        cpp.updated_at
      FROM projects p
      LEFT JOIN client_project_portal cpp ON p.id = cpp.project_id
      WHERE p.id = $1
    `, [projectId])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    return {
      projectId: project.id,
      projectName: project.name,
      clientId: project.client_id,
      settings: {
        portalEnabled: project.portal_enabled ?? true,
        showTimeline: project.show_timeline ?? true,
        showBudget: project.show_budget ?? false,
        showTasks: project.show_tasks ?? true,
        showFiles: project.show_files ?? true,
        showInvoices: project.show_invoices ?? true,
        allowComments: project.allow_comments ?? true,
        allowApprovals: project.allow_approvals ?? true,
        allowFileUploads: project.allow_file_uploads ?? false,
        notificationPreferences: project.notification_preferences ?? {},
        customBranding: project.custom_branding ?? {},
        welcomeMessage: project.welcome_message ?? null
      },
      createdAt: project.created_at,
      updatedAt: project.updated_at
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch project settings:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch project settings'
    })
  }
})
