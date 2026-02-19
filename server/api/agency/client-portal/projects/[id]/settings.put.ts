/**
 * Update Client Portal Project Settings
 * PUT /api/agency/client-portal/projects/:id/settings
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateSettingsBody {
  portalEnabled?: boolean
  showTimeline?: boolean
  showBudget?: boolean
  showTasks?: boolean
  showFiles?: boolean
  showInvoices?: boolean
  allowComments?: boolean
  allowApprovals?: boolean
  allowFileUploads?: boolean
  notificationPreferences?: Record<string, any>
  customBranding?: Record<string, any>
  welcomeMessage?: string
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  const body = await readBody<UpdateSettingsBody>(event)

  try {
    // Verify project exists
    const project = await queryOne(`
      SELECT id, client_id FROM projects WHERE id = $1
    `, [projectId])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Check if settings record exists
    const existingSettings = await queryOne(`
      SELECT id FROM client_project_portal WHERE project_id = $1
    `, [projectId])

    let settings

    if (existingSettings) {
      // Update existing settings
      const updates: string[] = []
      const params: any[] = []
      let idx = 1

      if (body.portalEnabled !== undefined) {
        updates.push(`portal_enabled = $${idx++}`)
        params.push(body.portalEnabled)
      }

      if (body.showTimeline !== undefined) {
        updates.push(`show_timeline = $${idx++}`)
        params.push(body.showTimeline)
      }

      if (body.showBudget !== undefined) {
        updates.push(`show_budget = $${idx++}`)
        params.push(body.showBudget)
      }

      if (body.showTasks !== undefined) {
        updates.push(`show_tasks = $${idx++}`)
        params.push(body.showTasks)
      }

      if (body.showFiles !== undefined) {
        updates.push(`show_files = $${idx++}`)
        params.push(body.showFiles)
      }

      if (body.showInvoices !== undefined) {
        updates.push(`show_invoices = $${idx++}`)
        params.push(body.showInvoices)
      }

      if (body.allowComments !== undefined) {
        updates.push(`allow_comments = $${idx++}`)
        params.push(body.allowComments)
      }

      if (body.allowApprovals !== undefined) {
        updates.push(`allow_approvals = $${idx++}`)
        params.push(body.allowApprovals)
      }

      if (body.allowFileUploads !== undefined) {
        updates.push(`allow_file_uploads = $${idx++}`)
        params.push(body.allowFileUploads)
      }

      if (body.notificationPreferences !== undefined) {
        updates.push(`notification_preferences = $${idx++}`)
        params.push(JSON.stringify(body.notificationPreferences))
      }

      if (body.customBranding !== undefined) {
        updates.push(`custom_branding = $${idx++}`)
        params.push(JSON.stringify(body.customBranding))
      }

      if (body.welcomeMessage !== undefined) {
        updates.push(`welcome_message = $${idx++}`)
        params.push(body.welcomeMessage)
      }

      if (updates.length === 0) {
        return {
          success: true,
          message: 'No changes provided'
        }
      }

      updates.push('updated_at = NOW()')
      params.push(projectId)

      settings = await queryOne(`
        UPDATE client_project_portal
        SET ${updates.join(', ')}
        WHERE project_id = $${idx}
        RETURNING *
      `, params)
    } else {
      // Create new settings record
      settings = await queryOne(`
        INSERT INTO client_project_portal (
          project_id,
          portal_enabled,
          show_timeline,
          show_budget,
          show_tasks,
          show_files,
          show_invoices,
          allow_comments,
          allow_approvals,
          allow_file_uploads,
          notification_preferences,
          custom_branding,
          welcome_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        projectId,
        body.portalEnabled ?? true,
        body.showTimeline ?? true,
        body.showBudget ?? false,
        body.showTasks ?? true,
        body.showFiles ?? true,
        body.showInvoices ?? true,
        body.allowComments ?? true,
        body.allowApprovals ?? true,
        body.allowFileUploads ?? false,
        JSON.stringify(body.notificationPreferences ?? {}),
        JSON.stringify(body.customBranding ?? {}),
        body.welcomeMessage ?? null
      ])
    }

    return {
      success: true,
      settings: {
        portalEnabled: settings.portal_enabled,
        showTimeline: settings.show_timeline,
        showBudget: settings.show_budget,
        showTasks: settings.show_tasks,
        showFiles: settings.show_files,
        showInvoices: settings.show_invoices,
        allowComments: settings.allow_comments,
        allowApprovals: settings.allow_approvals,
        allowFileUploads: settings.allow_file_uploads,
        notificationPreferences: settings.notification_preferences,
        customBranding: settings.custom_branding,
        welcomeMessage: settings.welcome_message
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update project settings:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update project settings'
    })
  }
})
