/**
 * Agency Retainers API
 * Returns all clients with retainer agreements and their usage tracking
 */

import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const period = query.period as string || new Date().toISOString().slice(0, 7) // Default to current month

  try {
    // Get all clients with retainer billing
    const retainerClients = await queryRows(`
      SELECT
        c.id,
        c.name,
        c.retainer_amount,
        c.billing_type,
        c.is_active
      FROM agency_clients c
      WHERE c.billing_type IN ('retainer', 'hybrid')
        AND c.retainer_amount > 0
        AND c.is_active = true
      ORDER BY c.name
    `)

    // Get time entries for the period grouped by client
    const timeUsage = await queryRows(`
      SELECT
        c.id as client_id,
        SUM(te.hours) as hours_used,
        SUM(te.hours * te.hourly_rate) as amount_used,
        COUNT(DISTINCT te.project_id) as projects_with_time
      FROM agency_clients c
      JOIN projects p ON c.id = p.client_id
      JOIN time_entries te ON p.id = te.project_id
      WHERE c.billing_type IN ('retainer', 'hybrid')
        AND to_char(te.date, 'YYYY-MM') = $1
      GROUP BY c.id
    `, [period])

    // Map usage to clients
    const usageMap = new Map(timeUsage.map(u => [u.client_id, u]))

    // Get rollover/carryover from previous periods (if tracked)
    const retainers = retainerClients.map(client => {
      const usage = usageMap.get(client.id) || { hours_used: 0, amount_used: 0, projects_with_time: 0 }
      const retainerAmount = Number(client.retainer_amount) || 0
      const amountUsed = Number(usage.amount_used) || 0
      const hoursUsed = Number(usage.hours_used) || 0

      const remaining = retainerAmount - amountUsed
      const utilizationRate = retainerAmount > 0 ? (amountUsed / retainerAmount) * 100 : 0

      return {
        clientId: client.id,
        clientName: client.name,
        billingType: client.billing_type,
        retainerAmount,
        hoursUsed,
        amountUsed,
        remaining,
        utilizationRate,
        projectsWithTime: Number(usage.projects_with_time) || 0,
        status: utilizationRate >= 100 ? 'exceeded' :
                utilizationRate >= 80 ? 'at_risk' :
                utilizationRate >= 50 ? 'on_track' : 'under_utilized'
      }
    })

    // Calculate summary
    const summary = {
      totalMRR: retainers.reduce((sum, r) => sum + r.retainerAmount, 0),
      totalUsed: retainers.reduce((sum, r) => sum + r.amountUsed, 0),
      totalRemaining: retainers.reduce((sum, r) => sum + r.remaining, 0),
      avgUtilization: retainers.length > 0
        ? retainers.reduce((sum, r) => sum + r.utilizationRate, 0) / retainers.length
        : 0,
      clientsExceeded: retainers.filter(r => r.status === 'exceeded').length,
      clientsAtRisk: retainers.filter(r => r.status === 'at_risk').length,
      clientsOnTrack: retainers.filter(r => r.status === 'on_track').length,
      clientsUnderUtilized: retainers.filter(r => r.status === 'under_utilized').length,
      totalClients: retainers.length
    }

    return {
      retainers,
      summary,
      period
    }
  } catch (error) {
    console.error('Failed to fetch retainers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch retainer data'
    })
  }
})
