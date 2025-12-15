/**
 * Projects List Endpoint
 * Returns all projects with profitability calculations
 */

import type { ProjectProfitability } from '~/types'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { status, clientId } = query

  // Mock projects data - in production, this comes from database
  const projects: (ProjectProfitability & {
    id: string
    startDate: string
    endDate?: string
    budgetType: string
  })[] = [
    {
      id: '1',
      projectId: '1',
      projectName: 'Acme Q4 Campaign',
      clientName: 'Acme Corporation',
      budget: 75000,
      budgetAmount: 75000,
      laborCost: 48000,
      expenseCost: 12000,
      mediaCost: 8500,
      totalCost: 68500,
      revenue: 75000,
      grossProfit: 6500,
      grossMargin: 8.7,
      hoursWorked: 320,
      effectiveRate: 234,
      status: 'active',
      startDate: '2024-10-01',
      endDate: '2024-12-31',
      budgetType: 'fixed'
    },
    {
      id: '2',
      projectId: '2',
      projectName: 'TechStart Website Redesign',
      clientName: 'TechStart Inc',
      budget: 45000,
      budgetAmount: 45000,
      laborCost: 28000,
      expenseCost: 5000,
      mediaCost: 0,
      totalCost: 33000,
      revenue: 45000,
      grossProfit: 12000,
      grossMargin: 26.7,
      hoursWorked: 180,
      effectiveRate: 250,
      status: 'active',
      startDate: '2024-11-01',
      endDate: '2025-01-15',
      budgetType: 'fixed'
    },
    {
      id: '3',
      projectId: '3',
      projectName: 'Monthly Retainer - Social',
      clientName: 'Acme Corporation',
      budget: 15000,
      budgetAmount: 15000,
      laborCost: 8500,
      expenseCost: 1200,
      mediaCost: 0,
      totalCost: 9700,
      revenue: 15000,
      grossProfit: 5300,
      grossMargin: 35.3,
      hoursWorked: 60,
      effectiveRate: 250,
      status: 'active',
      startDate: '2024-12-01',
      endDate: '2024-12-31',
      budgetType: 'retainer_allocation'
    },
    {
      id: '4',
      projectId: '4',
      projectName: 'Brand Guidelines Update',
      clientName: 'Local Restaurant Group',
      budget: 8500,
      budgetAmount: 8500,
      laborCost: 4200,
      expenseCost: 800,
      mediaCost: 0,
      totalCost: 5000,
      revenue: 8500,
      grossProfit: 3500,
      grossMargin: 41.2,
      hoursWorked: 35,
      effectiveRate: 243,
      status: 'completed',
      startDate: '2024-11-15',
      endDate: '2024-12-10',
      budgetType: 'fixed'
    },
    {
      id: '5',
      projectId: '5',
      projectName: 'Google Ads Management',
      clientName: 'TechStart Inc',
      budget: 5000,
      budgetAmount: 5000,
      laborCost: 2800,
      expenseCost: 0,
      mediaCost: 0,
      totalCost: 2800,
      revenue: 5000,
      grossProfit: 2200,
      grossMargin: 44.0,
      hoursWorked: 20,
      effectiveRate: 250,
      status: 'active',
      startDate: '2024-12-01',
      budgetType: 'retainer_allocation'
    },
    {
      id: '6',
      projectId: '6',
      projectName: 'Holiday Campaign Creative',
      clientName: 'Local Restaurant Group',
      budget: 12000,
      budgetAmount: 12000,
      laborCost: 0,
      expenseCost: 0,
      mediaCost: 0,
      totalCost: 0,
      revenue: 12000,
      grossProfit: 12000,
      grossMargin: 100,
      hoursWorked: 0,
      effectiveRate: 0,
      status: 'draft',
      startDate: '2024-12-15',
      endDate: '2024-12-24',
      budgetType: 'fixed'
    }
  ]

  // Apply filters
  let filtered = projects

  if (status && status !== 'all') {
    filtered = filtered.filter(p => p.status === status)
  }

  if (clientId) {
    // In production, filter by actual client ID
    filtered = filtered.filter(p => p.clientName.toLowerCase().includes(String(clientId).toLowerCase()))
  }

  // Map to expected format
  return filtered.map(p => ({
    id: p.id,
    name: p.projectName,
    clientName: p.clientName,
    budgetAmount: p.budget,
    totalCost: p.totalCost,
    laborCost: p.laborCost,
    expenseCost: p.expenseCost,
    mediaCost: p.mediaCost,
    grossProfit: p.grossProfit,
    grossMargin: p.grossMargin,
    hoursWorked: p.hoursWorked,
    effectiveRate: p.effectiveRate,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    budgetType: p.budgetType
  }))
})
