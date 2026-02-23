import { query } from '../../utils/db'
import { requireRole } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  try {
    // Check authentication
    const user = event.context.user
    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Authentication required'
      })
    }

    // Get query params
    const queryParams = getQuery(event)
    const { status, assigned_to, search } = queryParams

    // Build query
    let sql = `
      SELECT 
        i.*,
        c.name as client_name,
        c.xero_contact_id,
        pm.name as project_manager_name,
        ac.name as assigned_consultant_name,
        COUNT(t.id) FILTER (WHERE t.status = 'complete') as completed_tasks,
        COUNT(t.id) as total_tasks
      FROM xero_implementations i
      JOIN agency_clients c ON i.client_id = c.id
      LEFT JOIN team_members pm ON i.project_manager_id = pm.id
      LEFT JOIN team_members ac ON i.assigned_consultant_id = ac.id
      LEFT JOIN implementation_tasks t ON i.id = t.implementation_id
      WHERE 1=1
    `
    
    const params: any[] = []
    let paramIndex = 1

    // Filter by user role
    if (user.role === 'consultant') {
      sql += ` AND (i.project_manager_id = $${paramIndex} OR i.assigned_consultant_id = $${paramIndex})`
      params.push(user.id)
      paramIndex++
    }

    // Filter by status
    if (status) {
      sql += ` AND i.status = $${paramIndex}`
      params.push(status)
      paramIndex++
    }

    // Filter by assigned PM
    if (assigned_to) {
      sql += ` AND i.project_manager_id = $${paramIndex}`
      params.push(assigned_to)
      paramIndex++
    }

    // Search by client name
    if (search) {
      sql += ` AND c.name ILIKE $${paramIndex}`
      params.push(`%${search}%`)
      paramIndex++
    }

    sql += `
      GROUP BY i.id, c.name, c.xero_contact_id, pm.name, ac.name
      ORDER BY i.created_at DESC
    `

    const implementations = await query(sql, params)

    return {
      success: true,
      data: implementations
    }
  } catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to fetch implementations'
    })
  }
})
