/**
 * Recent Time Entries Endpoint
 * Returns recent time entries for the dashboard
 */

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Number(query.limit) || 5

  // Mock recent time entries - in production, from database
  const entries = [
    {
      id: '1',
      project: 'Acme Q4 Campaign',
      projectId: '1',
      user: 'Sarah Chen',
      userId: 'u1',
      description: 'Campaign creative development',
      hours: 6.5,
      date: '2024-12-14',
      billable: true,
      hourlyRate: 150
    },
    {
      id: '2',
      project: 'TechStart Website Redesign',
      projectId: '2',
      user: 'Mike Rodriguez',
      userId: 'u2',
      description: 'Homepage wireframes and mockups',
      hours: 4.0,
      date: '2024-12-14',
      billable: true,
      hourlyRate: 175
    },
    {
      id: '3',
      project: 'Monthly Retainer - Social',
      projectId: '3',
      user: 'Emily Thompson',
      userId: 'u3',
      description: 'Social media content calendar',
      hours: 3.0,
      date: '2024-12-13',
      billable: true,
      hourlyRate: 125
    },
    {
      id: '4',
      project: 'Google Ads Management',
      projectId: '5',
      user: 'David Kim',
      userId: 'u4',
      description: 'Campaign optimization and reporting',
      hours: 2.5,
      date: '2024-12-13',
      billable: true,
      hourlyRate: 140
    },
    {
      id: '5',
      project: 'Acme Q4 Campaign',
      projectId: '1',
      user: 'Sarah Chen',
      userId: 'u1',
      description: 'Client presentation prep',
      hours: 2.0,
      date: '2024-12-13',
      billable: true,
      hourlyRate: 150
    },
    {
      id: '6',
      project: 'Internal - Team Meeting',
      projectId: null,
      user: 'All Team',
      userId: null,
      description: 'Weekly status meeting',
      hours: 1.0,
      date: '2024-12-13',
      billable: false,
      hourlyRate: 0
    }
  ]

  // Calculate totals for today and this week
  const today = new Date().toISOString().split('T')[0]
  const todayEntries = entries.filter(e => e.date === today)
  const todayHours = todayEntries.reduce((sum, e) => sum + e.hours, 0)
  const todayBillable = todayEntries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0)

  // Week totals (simplified - just sum all mock data)
  const weekHours = entries.reduce((sum, e) => sum + e.hours, 0)
  const weekBillable = entries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0)
  const weekRevenue = entries.filter(e => e.billable).reduce((sum, e) => sum + (e.hours * e.hourlyRate), 0)

  return {
    entries: entries.slice(0, limit),
    summary: {
      today: {
        total: todayHours,
        billable: todayBillable,
        utilization: todayHours > 0 ? (todayBillable / todayHours) * 100 : 0
      },
      week: {
        total: weekHours,
        billable: weekBillable,
        utilization: weekHours > 0 ? (weekBillable / weekHours) * 100 : 0,
        revenue: weekRevenue
      }
    }
  }
})
