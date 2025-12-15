/**
 * Recent Time Entries Endpoint
 * Returns recent time entries for the dashboard
 */

import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Number(query.limit) || 5

  try {
    // Get recent time entries
    const entries = await queryRows(`
      SELECT
        te.id,
        p.name as project,
        te.project_id,
        tm.name as user_name,
        te.user_id,
        te.description,
        te.hours,
        te.date,
        te.billable,
        te.hourly_rate
      FROM time_entries te
      LEFT JOIN projects p ON te.project_id = p.id
      LEFT JOIN team_members tm ON te.user_id = tm.id
      ORDER BY te.date DESC, te.created_at DESC
      LIMIT $1
    `, [limit])

    // Get today's summary
    const todaySummary = await queryOne(`
      SELECT
        COALESCE(SUM(hours), 0) as total,
        COALESCE(SUM(CASE WHEN billable THEN hours ELSE 0 END), 0) as billable
      FROM time_entries
      WHERE date = CURRENT_DATE
    `)

    // Get this week's summary (Monday to Sunday)
    const weekSummary = await queryOne(`
      SELECT
        COALESCE(SUM(hours), 0) as total,
        COALESCE(SUM(CASE WHEN billable THEN hours ELSE 0 END), 0) as billable,
        COALESCE(SUM(CASE WHEN billable THEN hours * hourly_rate ELSE 0 END), 0) as revenue
      FROM time_entries
      WHERE date >= date_trunc('week', CURRENT_DATE)
        AND date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
    `)

    const todayTotal = Number(todaySummary?.total) || 0
    const todayBillable = Number(todaySummary?.billable) || 0
    const weekTotal = Number(weekSummary?.total) || 0
    const weekBillable = Number(weekSummary?.billable) || 0
    const weekRevenue = Number(weekSummary?.revenue) || 0

    return {
      entries: entries.map(e => ({
        id: e.id,
        project: e.project || 'Internal',
        projectId: e.project_id,
        user: e.user_name || 'Unknown',
        userId: e.user_id,
        description: e.description,
        hours: Number(e.hours),
        date: e.date,
        billable: e.billable,
        hourlyRate: Number(e.hourly_rate)
      })),
      summary: {
        today: {
          total: todayTotal,
          billable: todayBillable,
          utilization: todayTotal > 0 ? (todayBillable / todayTotal) * 100 : 0
        },
        week: {
          total: weekTotal,
          billable: weekBillable,
          utilization: weekTotal > 0 ? (weekBillable / weekTotal) * 100 : 0,
          revenue: weekRevenue
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch recent time entries:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch recent time entries'
    })
  }
})
