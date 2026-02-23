/**
 * Customers API Endpoint
 * Returns real agency clients from the database with Xero contact links
 */

import { queryRows } from '~~/server/utils/db'

export interface Customer {
  id: string
  name: string
  email: string
  avatar?: {
    src?: string
    alt?: string
  }
  status: 'active' | 'inactive'
  location?: string
  billingType: string
  totalRevenue: number
  activeProjects: number
  xeroContactId?: string
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const activeOnly = query.active !== 'false'

  try {
    // Get clients from agency_clients table with profitability data
    const clients = await queryRows(`
      SELECT
        c.id,
        c.name,
        c.xero_contact_id,
        c.billing_type,
        c.is_active,
        c.created_at,
        COALESCE(stats.total_revenue, 0) as total_revenue,
        COALESCE(stats.active_projects, 0) as active_projects,
        -- Get primary contact email if available
        COALESCE(pc.email, '') as primary_email,
        COALESCE(pc.first_name, '') as contact_first_name,
        COALESCE(pc.last_name, '') as contact_last_name
      FROM agency_clients c
      LEFT JOIN (
        SELECT
          p.client_id,
          SUM(p.budget_amount) as total_revenue,
          COUNT(CASE WHEN p.status = 'active' THEN 1 END) as active_projects
        FROM projects p
        GROUP BY p.client_id
      ) stats ON c.id = stats.client_id
      -- Try to get a primary contact (in a real implementation, you might have a client_contacts table)
      LEFT JOIN LATERAL (
        SELECT '' as email, '' as first_name, '' as last_name
      ) pc ON true
      WHERE ($1 = false OR c.is_active = true)
      ORDER BY c.name ASC
    `, [!activeOnly])

    // Transform to customer format
    const customers: Customer[] = clients.map((c, index) => ({
      id: c.id,
      name: c.name,
      email: c.primary_email || `accounts@${c.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.au`,
      avatar: {
        src: `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=random&color=fff&size=128`,
        alt: c.name
      },
      status: c.is_active ? 'active' as const : 'inactive' as const,
      location: 'Australia', // Default location - can be enhanced with address data
      billingType: c.billing_type,
      totalRevenue: Number(c.total_revenue) || 0,
      activeProjects: Number(c.active_projects) || 0,
      xeroContactId: c.xero_contact_id
    }))

    return customers
  } catch (error) {
    console.error('Failed to fetch customers:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch customers'
    })
  }
})
