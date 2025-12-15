/**
 * Agency KPIs Endpoint
 * Returns key performance indicators for the agency dashboard
 */

import type { AgencyKPIs } from '~/types'

export default defineEventHandler(async (event) => {
  // In production, these would come from the database via Zero sync
  // For now, return mock data that represents typical agency metrics

  const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM

  // Mock KPI data based on industry benchmarks
  const kpis: AgencyKPIs & {
    revenueChange: number
    marginChange: number
    utilizationChange: number
    mrrChange: number
    outstandingAR: number
    teamUtilization: Array<{ name: string; rate: number; target: number }>
    budgetAlerts: Array<{
      project: string
      severity: 'warning' | 'critical'
      percentUsed: number
      message: string
    }>
  } = {
    period: currentMonth,

    // Financial KPIs
    totalRevenue: 285000,
    totalCost: 185000,
    grossProfit: 100000,
    grossMargin: 35.1, // Industry target: 30%+
    netProfit: 45000,
    netMargin: 15.8, // Industry target: 15-25%
    mrr: 65000, // Monthly recurring from retainers

    // Operational KPIs
    avgUtilizationRate: 72.5, // Industry target: 70-85%
    avgBillableRate: 165, // Average hourly rate
    writeOffAmount: 3500,
    writeOffRate: 1.2, // Industry target: <5%

    // Client KPIs
    activeClients: 12,
    activeProjects: 18,
    avgProjectValue: 25000,
    clientChurnRate: 8.3, // Industry target: <10%

    // Benchmarks
    billingsPerFTE: 142000, // Industry benchmark: >$135,000
    revenuePerEmployee: 178000,

    // Change indicators (vs. last month)
    revenueChange: 8.5,
    marginChange: 2.1,
    utilizationChange: -1.5,
    mrrChange: 5.0,

    // AR
    outstandingAR: 42500,

    // Team utilization breakdown
    teamUtilization: [
      { name: 'Creative Team', rate: 78, target: 80 },
      { name: 'Account Mgmt', rate: 65, target: 70 },
      { name: 'Media Team', rate: 82, target: 85 },
      { name: 'Strategy', rate: 58, target: 60 },
      { name: 'Development', rate: 75, target: 80 }
    ],

    // Budget alerts
    budgetAlerts: [
      {
        project: 'Acme Q4 Campaign',
        severity: 'critical',
        percentUsed: 95,
        message: 'Only 5% budget remaining with 3 weeks left'
      },
      {
        project: 'TechStart Website Redesign',
        severity: 'warning',
        percentUsed: 82,
        message: 'Approaching budget limit, review scope'
      }
    ]
  }

  return kpis
})
