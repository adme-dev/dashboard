/**
 * Agency Clients List Endpoint
 * Returns all clients with summary data
 */

import type { AgencyClient, ClientProfitability } from '~/types'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { active } = query

  // Mock clients data - in production, this comes from database
  const clients: (AgencyClient & Partial<ClientProfitability>)[] = [
    {
      id: '1',
      name: 'Acme Corporation',
      xeroContactId: 'xero-acme-123',
      billingType: 'hybrid',
      retainerAmount: 15000,
      paymentTerms: 30,
      hourlyRate: 175,
      mediaCommissionRate: 15,
      isActive: true,
      createdAt: '2024-01-15',
      updatedAt: '2024-12-01',
      notes: 'Key account - monthly retainer plus project work',
      // Profitability data
      totalRevenue: 180000,
      totalCost: 118000,
      grossProfit: 62000,
      grossMargin: 34.4,
      projectCount: 8,
      activeProjects: 2,
      avgProjectMargin: 32.5,
      lifetimeValue: 450000
    },
    {
      id: '2',
      name: 'TechStart Inc',
      xeroContactId: 'xero-tech-456',
      billingType: 'retainer',
      retainerAmount: 8000,
      paymentTerms: 15,
      hourlyRate: 150,
      mediaCommissionRate: undefined,
      isActive: true,
      createdAt: '2024-06-01',
      updatedAt: '2024-12-05',
      notes: 'Monthly retainer for ongoing marketing support',
      // Profitability data
      totalRevenue: 48000,
      totalCost: 31000,
      grossProfit: 17000,
      grossMargin: 35.4,
      projectCount: 3,
      activeProjects: 2,
      avgProjectMargin: 35.2,
      lifetimeValue: 96000
    },
    {
      id: '3',
      name: 'Local Restaurant Group',
      xeroContactId: 'xero-rest-789',
      billingType: 'project',
      retainerAmount: undefined,
      paymentTerms: 30,
      hourlyRate: 125,
      mediaCommissionRate: 10,
      isActive: true,
      createdAt: '2024-09-01',
      updatedAt: '2024-12-10',
      notes: 'Project-based work with occasional media buys',
      // Profitability data
      totalRevenue: 20500,
      totalCost: 12200,
      grossProfit: 8300,
      grossMargin: 40.5,
      projectCount: 2,
      activeProjects: 1,
      avgProjectMargin: 40.8,
      lifetimeValue: 35000
    },
    {
      id: '4',
      name: 'Old Client Co',
      billingType: 'project',
      paymentTerms: 30,
      hourlyRate: 150,
      isActive: false,
      createdAt: '2023-03-01',
      updatedAt: '2024-06-30',
      notes: 'Inactive - completed all projects',
      totalRevenue: 45000,
      totalCost: 28000,
      grossProfit: 17000,
      grossMargin: 37.8,
      projectCount: 4,
      activeProjects: 0,
      avgProjectMargin: 38.2,
      lifetimeValue: 45000
    }
  ]

  // Filter by active status if specified
  let filtered = clients
  if (active !== undefined) {
    const isActive = active === 'true' || active === true
    filtered = filtered.filter(c => c.isActive === isActive)
  }

  return filtered
})
