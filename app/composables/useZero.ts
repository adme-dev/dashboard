/**
 * Zero Client Composable
 * Provides reactive access to Zero sync engine
 */

import { Zero } from '@rocicorp/zero'
import { schema, permissions, type Schema } from '~/zero/schema'

// Singleton Zero instance
let zeroInstance: Zero<Schema> | null = null

export function useZero() {
  const config = useRuntimeConfig()
  const { $pinia } = useNuxtApp()

  // Initialize Zero client (singleton)
  if (!zeroInstance && import.meta.client) {
    const zeroServerUrl = config.public.zeroServerUrl || 'http://localhost:4848'

    zeroInstance = new Zero({
      userID: 'anonymous', // Will be set after auth
      auth: async () => {
        // Return JWT token for authentication
        // For now, return empty string (anonymous access)
        // In production, integrate with your auth system
        return ''
      },
      server: zeroServerUrl,
      schema,
      // Enable offline support
      kvStore: 'idb', // IndexedDB for persistence
    })
  }

  return {
    zero: zeroInstance,
    schema,
  }
}

// ============================================
// Query Composables
// ============================================

/**
 * Fetch all active clients
 */
export function useAgencyClients() {
  const { zero } = useZero()

  const query = computed(() => {
    if (!zero?.query?.agencyClients) return null
    return zero.query.agencyClients
      .where('isActive', '=', true)
      .orderBy('name', 'asc')
  })

  const { data, status } = useQuery(query)

  return {
    clients: data,
    loading: computed(() => status.value === 'pending'),
  }
}

/**
 * Fetch single client by ID
 */
export function useAgencyClient(clientId: MaybeRef<string>) {
  const { zero } = useZero()
  const id = toRef(clientId)

  const query = computed(() => {
    if (!zero?.query?.agencyClients || !id.value) return null
    return zero.query.agencyClients.where('id', '=', id.value).one()
  })

  const { data, status } = useQuery(query)

  return {
    client: data,
    loading: computed(() => status.value === 'pending'),
  }
}

/**
 * Fetch projects with optional filters
 */
export function useProjects(filters?: {
  clientId?: MaybeRef<string | null>
  status?: MaybeRef<string | null>
}) {
  const { zero } = useZero()
  const clientId = filters?.clientId ? toRef(filters.clientId) : ref(null)
  const status = filters?.status ? toRef(filters.status) : ref(null)

  const query = computed(() => {
    if (!zero?.query?.projects) return null

    let q = zero.query.projects.related('client')

    if (clientId.value) {
      q = q.where('clientId', '=', clientId.value)
    }

    if (status.value) {
      q = q.where('status', '=', status.value)
    }

    return q.orderBy('startDate', 'desc')
  })

  const { data, status: queryStatus } = useQuery(query)

  return {
    projects: data,
    loading: computed(() => queryStatus.value === 'pending'),
  }
}

/**
 * Fetch project profitability data
 * Joins projects with time entries and expenses for real-time profitability
 */
export function useProjectProfitability(projectId?: MaybeRef<string | null>) {
  const { zero } = useZero()
  const id = projectId ? toRef(projectId) : ref(null)

  // Query for time entries
  const timeQuery = computed(() => {
    if (!zero?.query?.timeEntries) return null
    let q: any = zero.query.timeEntries
    if (id.value) {
      q = q.where('projectId', '=', id.value)
    }
    return q
  })

  // Query for expenses
  const expenseQuery = computed(() => {
    if (!zero?.query?.projectExpenses) return null
    let q: any = zero.query.projectExpenses
    if (id.value) {
      q = q.where('projectId', '=', id.value)
    }
    return q
  })

  // Query for projects
  const projectQuery = computed(() => {
    if (!zero?.query?.projects) return null
    let q: any = zero.query.projects.related('client')
    if (id.value) {
      q = q.where('id', '=', id.value)
    }
    return q
  })

  const { data: timeEntries } = useQuery(timeQuery)
  const { data: expenses } = useQuery(expenseQuery)
  const { data: projects } = useQuery(projectQuery)

  // Calculate profitability metrics
  const profitability = computed(() => {
    if (!projects.value) return []

    const projectsArray = Array.isArray(projects.value) ? projects.value : []
    const timeArray = Array.isArray(timeEntries.value) ? timeEntries.value : []
    const expensesArray = Array.isArray(expenses.value) ? expenses.value : []

    return projectsArray.map((project: any) => {
      const projectTime = timeArray.filter(
        (t: any) => t.projectId === project.id
      )
      const projectExpenses = expensesArray.filter(
        (e: any) => e.projectId === project.id
      )

      const laborCost = projectTime.reduce(
        (sum: number, t: any) => sum + t.hours * t.hourlyRate,
        0
      )
      const expenseCost = projectExpenses.reduce((sum: number, e: any) => sum + e.amount, 0)
      const totalCost = laborCost + expenseCost
      const hoursWorked = projectTime.reduce((sum: number, t: any) => sum + t.hours, 0)

      // For now, revenue = budget (will be enhanced with actual invoicing)
      const revenue = project.budgetAmount
      const grossProfit = revenue - totalCost
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
      const effectiveRate = hoursWorked > 0 ? revenue / hoursWorked : 0

      return {
        projectId: project.id,
        projectName: project.name,
        clientName: project.client?.name || 'Unknown',
        budget: project.budgetAmount,
        laborCost,
        expenseCost,
        mediaCost: 0, // Will add media spend integration
        totalCost,
        revenue,
        grossProfit,
        grossMargin,
        hoursWorked,
        effectiveRate,
        status: project.status,
      }
    })
  })

  return {
    profitability,
    loading: computed(() => !projects.value),
  }
}

/**
 * Fetch team utilization metrics
 */
export function useUtilization(period?: MaybeRef<string | null>) {
  const { zero } = useZero()
  const periodRef = period ? toRef(period) : ref(null)

  const teamQuery = computed(() => {
    if (!zero?.query?.teamMembers) return null
    return zero.query.teamMembers.where('isActive', '=', true)
  })

  const timeQuery = computed(() => {
    if (!zero) return null
    return zero.query.timeEntries
  })

  const { data: teamMembers } = useQuery(teamQuery)
  const { data: timeEntries } = useQuery(timeQuery)

  const utilization = computed(() => {
    if (!teamMembers.value) return []

    const periodFilter = periodRef.value
    const membersArray = Array.isArray(teamMembers.value) ? teamMembers.value : []
    const timeArray = Array.isArray(timeEntries.value) ? timeEntries.value : []

    return membersArray.map((member: any) => {
      let memberTime = timeArray.filter(
        (t: any) => t.userId === member.id
      )

      // Filter by period if provided (YYYY-MM format)
      if (periodFilter) {
        memberTime = memberTime.filter((t: any) => t.date.startsWith(periodFilter))
      }

      const totalHours = memberTime.reduce((sum: number, t: any) => sum + t.hours, 0)
      const billableHours = memberTime
        .filter((t: any) => t.billable)
        .reduce((sum: number, t: any) => sum + t.hours, 0)
      const nonBillableHours = totalHours - billableHours

      const utilizationRate =
        totalHours > 0 ? (billableHours / totalHours) * 100 : 0

      const billableRevenue = memberTime
        .filter((t: any) => t.billable)
        .reduce((sum: number, t: any) => sum + t.hours * t.hourlyRate, 0)

      const effectiveRate = billableHours > 0 ? billableRevenue / billableHours : 0

      return {
        userId: member.id,
        userName: member.name,
        period: periodFilter || 'all',
        totalHours,
        billableHours,
        nonBillableHours,
        utilizationRate,
        targetUtilization: member.targetUtilization,
        billableRevenue,
        effectiveRate,
      }
    })
  })

  return {
    utilization,
    loading: computed(() => !teamMembers.value),
  }
}

/**
 * Fetch Chart of Accounts
 */
export function useChartOfAccounts(category?: MaybeRef<string | null>) {
  const { zero } = useZero()
  const categoryRef = category ? toRef(category) : ref(null)

  const query = computed(() => {
    if (!zero?.query?.chartOfAccounts) return null

    let q: any = zero.query.chartOfAccounts.where('isActive', '=', true)

    if (categoryRef.value) {
      q = q.where('category', '=', categoryRef.value)
    }

    return q.orderBy('code', 'asc')
  })

  const { data, status } = useQuery(query)

  return {
    accounts: data,
    loading: computed(() => status.value === 'pending'),
  }
}

/**
 * Fetch media spend with optional filters
 */
export function useMediaSpend(filters?: {
  clientId?: MaybeRef<string | null>
  period?: MaybeRef<string | null>
  platform?: MaybeRef<string | null>
}) {
  const { zero } = useZero()

  const clientId = filters?.clientId ? toRef(filters.clientId) : ref(null)
  const period = filters?.period ? toRef(filters.period) : ref(null)
  const platform = filters?.platform ? toRef(filters.platform) : ref(null)

  const query = computed(() => {
    if (!zero?.query?.mediaSpend) return null

    let q: any = zero.query.mediaSpend.related('client')

    if (clientId.value) {
      q = q.where('clientId', '=', clientId.value)
    }

    if (period.value) {
      q = q.where('period', '=', period.value)
    }

    if (platform.value) {
      q = q.where('platform', '=', platform.value)
    }

    return q.orderBy('period', 'desc')
  })

  const { data, status } = useQuery(query)

  // Aggregate totals
  const totals = computed(() => {
    if (!data.value) return null

    const dataArray = Array.isArray(data.value) ? data.value : []

    return {
      totalBudget: dataArray.reduce((sum: number, m: any) => sum + m.budgetAllocated, 0),
      totalSpend: dataArray.reduce((sum: number, m: any) => sum + m.actualSpend, 0),
      totalCommission: dataArray.reduce((sum: number, m: any) => sum + m.commissionAmount, 0),
      unreconciled: dataArray.filter((m: any) => !m.reconciled).length,
    }
  })

  return {
    mediaSpend: data,
    totals,
    loading: computed(() => status.value === 'pending'),
  }
}

// ============================================
// Mutation Helpers
// ============================================

/**
 * Create or update a client
 */
export async function upsertClient(
  client: Partial<Schema['tables']['agencyClients']['columns']> & { id?: string }
) {
  const { zero } = useZero()
  if (!zero) throw new Error('Zero not initialized')

  const now = Date.now()
  const id = client.id || crypto.randomUUID()

  await zero.mutate?.agencyClients?.upsert({
    id,
    name: client.name || '',
    billingType: client.billingType || 'project',
    paymentTerms: client.paymentTerms || 30,
    isActive: client.isActive ?? true,
    createdAt: now,
    updatedAt: now,
    ...client,
  })

  return id
}

/**
 * Create or update a project
 */
export async function upsertProject(
  project: Partial<Schema['tables']['projects']['columns']> & { id?: string }
) {
  const { zero } = useZero()
  if (!zero) throw new Error('Zero not initialized')

  const now = Date.now()
  const id = project.id || crypto.randomUUID()

  await zero.mutate?.projects?.upsert({
    id,
    clientId: project.clientId || '',
    name: project.name || '',
    budgetAmount: project.budgetAmount || 0,
    budgetType: project.budgetType || 'fixed',
    startDate: project.startDate || new Date().toISOString().split('T')[0],
    status: project.status || 'draft',
    createdAt: now,
    updatedAt: now,
    ...project,
  })

  return id
}

/**
 * Log time entry
 */
export async function logTimeEntry(
  entry: Partial<Schema['tables']['timeEntries']['columns']> & {
    projectId: string
    userId: string
    hours: number
  }
) {
  const { zero } = useZero()
  if (!zero) throw new Error('Zero not initialized')

  const id = entry.id || crypto.randomUUID()

  const { projectId, userId, hours, ...restEntry } = entry
  await zero.mutate?.timeEntries?.insert({
    id,
    projectId,
    userId,
    date: entry.date || new Date().toISOString().split('T')[0],
    hours,
    billable: entry.billable ?? true,
    hourlyRate: entry.hourlyRate || 0,
    description: entry.description || '',
    approved: false,
    invoiced: false,
    createdAt: Date.now(),
    ...restEntry,
  })

  return id
}

/**
 * Record media spend
 */
export async function recordMediaSpend(
  spend: Partial<Schema['tables']['mediaSpend']['columns']> & {
    clientId: string
    platform: string
  }
) {
  const { zero } = useZero()
  if (!zero) throw new Error('Zero not initialized')

  const now = Date.now()
  const id = spend.id || crypto.randomUUID()

  const { clientId, platform, ...restSpend } = spend
  const actualSpend = spend.actualSpend || 0
  const commissionRate = spend.commissionRate || 0

  await zero.mutate?.mediaSpend?.upsert({
    id,
    clientId,
    platform,
    budgetAllocated: spend.budgetAllocated || 0,
    actualSpend,
    commissionRate,
    commissionAmount: (Number(actualSpend) * Number(commissionRate)) / 100,
    period:
      spend.period ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    reconciled: spend.reconciled || false,
    createdAt: now,
    updatedAt: now,
    ...restSpend,
  })

  return id
}

// Helper for useQuery with Zero
function useQuery<T>(query: ComputedRef<T | null>) {
  const data = ref<Awaited<T> | null>(null) as Ref<Awaited<T> | null>
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

  // Watch query changes and re-run
  watchEffect(async () => {
    const q = query.value
    if (!q) {
      status.value = 'idle'
      return
    }

    status.value = 'pending'
    try {
      // Zero queries are reactive - this is simplified for now
      // In production, use Zero's built-in reactivity
      const result = await (q as any)
      data.value = result
      status.value = 'success'
    } catch (e) {
      console.error('Query error:', e)
      status.value = 'error'
    }
  })

  return { data, status }
}
