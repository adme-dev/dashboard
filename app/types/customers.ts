/**
 * Customer Types
 * Used by the /customers page to display agency clients
 */

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
