/**
 * Projects Summary Endpoint
 * Returns aggregated project statistics and top projects for dashboard
 */

export default defineEventHandler(async (event) => {
  // In production, aggregate from database
  // For now, return mock summary data

  return {
    // Status distribution
    active: 4,
    draft: 1,
    onHold: 0,
    completed: 1,
    cancelled: 0,
    total: 6,

    // Financial summary
    totalBudget: 160500,
    totalSpent: 119000,
    totalProfit: 41500,
    avgMargin: 25.9,

    // Top projects by various metrics
    topProjects: [
      {
        id: '1',
        name: 'Acme Q4 Campaign',
        client: 'Acme Corporation',
        budget: 75000,
        spent: 68500,
        margin: 8.7,
        status: 'active'
      },
      {
        id: '2',
        name: 'TechStart Website Redesign',
        client: 'TechStart Inc',
        budget: 45000,
        spent: 33000,
        margin: 26.7,
        status: 'active'
      },
      {
        id: '3',
        name: 'Monthly Retainer - Social',
        client: 'Acme Corporation',
        budget: 15000,
        spent: 9700,
        margin: 35.3,
        status: 'active'
      },
      {
        id: '5',
        name: 'Google Ads Management',
        client: 'TechStart Inc',
        budget: 5000,
        spent: 2800,
        margin: 44.0,
        status: 'active'
      }
    ],

    // Projects at risk (budget concerns)
    atRisk: [
      {
        id: '1',
        name: 'Acme Q4 Campaign',
        budgetUsed: 91.3,
        daysRemaining: 17
      }
    ],

    // Recently completed
    recentlyCompleted: [
      {
        id: '4',
        name: 'Brand Guidelines Update',
        client: 'Local Restaurant Group',
        finalMargin: 41.2,
        completedDate: '2024-12-10'
      }
    ]
  }
})
