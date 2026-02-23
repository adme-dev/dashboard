import { queryOne, query } from '../../utils/db'

export default defineEventHandler(async (event) => {
  try {
    const user = event.context.user
    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Authentication required'
      })
    }

    const id = getRouterParam(event, 'id')
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Implementation ID is required'
      })
    }

    // Get implementation details
    const implementation = await queryOne(
      `SELECT 
        i.*,
        c.name as client_name,
        c.xero_contact_id,
        pm.name as project_manager_name,
        pm.email as project_manager_email,
        ac.name as assigned_consultant_name,
        ac.email as assigned_consultant_email
      FROM xero_implementations i
      JOIN agency_clients c ON i.client_id = c.id
      LEFT JOIN team_members pm ON i.project_manager_id = pm.id
      LEFT JOIN team_members ac ON i.assigned_consultant_id = ac.id
      WHERE i.id = $1`,
      [id]
    )

    if (!implementation) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Implementation not found'
      })
    }

    // Check access (simplified - in production use canAccessImplementation)
    if (user.role === 'consultant' && 
        implementation.project_manager_id !== user.id && 
        implementation.assigned_consultant_id !== user.id) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Access denied'
      })
    }

    // Get tasks
    const tasks = await query(
      `SELECT 
        t.*,
        tm.name as assigned_to_name,
        tm.email as assigned_to_email
      FROM implementation_tasks t
      LEFT JOIN team_members tm ON t.assigned_to_id = tm.id
      WHERE t.implementation_id = $1
      ORDER BY t.sort_order ASC, t.created_at ASC`,
      [id]
    )

    // Get recent comments
    const comments = await query(
      `SELECT 
        tc.*,
        tm.name as author_name
      FROM task_comments tc
      LEFT JOIN team_members tm ON tc.author_id = tm.id
      WHERE tc.task_id IN (SELECT id FROM implementation_tasks WHERE implementation_id = $1)
      ORDER BY tc.created_at DESC
      LIMIT 20`,
      [id]
    )

    // Get documents
    const documents = await query(
      `SELECT * FROM implementation_documents
      WHERE implementation_id = $1
      ORDER BY created_at DESC`,
      [id]
    )

    return {
      success: true,
      data: {
        ...implementation,
        tasks,
        comments,
        documents
      }
    }
  } catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to fetch implementation'
    })
  }
})
