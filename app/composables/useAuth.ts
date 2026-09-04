import type { User } from '~/types'

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}

export const useAuth = () => {
  const user = useState<User | null>('auth-user', () => null)
  const isLoading = useState('auth-loading', () => false)
  const router = useRouter()
  const apiFetch = $fetch as <T>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>
  
  const isAuthenticated = computed(() => !!user.value)
  
  const userRole = computed(() => user.value?.role)
  
  const hasRole = (roles: readonly string[]) => {
    if (!user.value) return false
    // Legacy: direct role name match
    if (roles.includes(user.value.role)) return true
    // Dynamic: check if roles correspond to any permission group the user has.
    // Multiple groups can share the same role array (e.g. MANAGEMENT, TIME_APPROVALS, AUTOMATION),
    // so we must check ALL matches.
    if (user.value.permissionGroups?.length) {
      const groups = permissionGroupsForRoles(roles)
      if (groups.some(g => user.value!.permissionGroups!.includes(g))) return true
    }
    return false
  }
  
  const isOwner = computed(() => user.value?.role === 'owner')
  const isAdmin = computed(() => hasRole(PERMISSIONS.ADMIN))
  const isManager = computed(() => hasRole(PERMISSIONS.MANAGEMENT))
  const isLead = computed(() => hasRole(['owner', 'admin', 'lead']))
  const isReadOnly = computed(() => !!user.value && (isReadOnlyRole(user.value.role) || user.value.isCustomReadOnly === true))
  const canWrite = computed(() => !!user.value && !isReadOnlyRole(user.value.role) && user.value.isCustomReadOnly !== true)
  const canAccessFinance = computed(() => hasRole(PERMISSIONS.FINANCE))
  const canAccessInvoices = computed(() => hasRole(PERMISSIONS.INVOICE_OWN_CLIENTS))
  const canAccessSales = computed(() => hasRole(PERMISSIONS.SALES))
  const canAccessClients = computed(() => hasRole(PERMISSIONS.CLIENTS))
  const canAccessCreative = computed(() => hasRole(PERMISSIONS.CREATIVE))
  const canAccessMediaBuying = computed(() => hasRole(PERMISSIONS.MEDIA_BUYING))
  const canAccessAdmin = computed(() => hasRole(PERMISSIONS.ADMIN))
  const canAccessHr = computed(() => hasRole(PERMISSIONS.HR_ADMIN))
  const canAccessAiTraining = computed(() => hasRole(PERMISSIONS.ADMIN))
  const canAccessTimeApprovals = computed(() => hasRole(PERMISSIONS.TIME_APPROVALS))
  const canAccessAutomation = computed(() => hasRole(PERMISSIONS.AUTOMATION))
  const canAccessReports = computed(() => hasRole(PERMISSIONS.MANAGEMENT))
  const userPermissionGroups = computed(() => user.value?.permissionGroups || [])
  const hasPermission = (group: string) => userPermissionGroups.value.includes(group)
  // Page Studio has its own granular permission family. Keep the legacy
  // Creative role as a compatibility fallback for existing staff.
  const canAccessPageStudio = computed(() => canAccessCreative.value || hasPermission('PAGE_STUDIO_VIEW'))

  // Fetch current user
  const fetchUser = async () => {
    try {
      isLoading.value = true
      const data = await apiFetch<any>('/api/auth/me').catch((err: any) => {
        // 503 = transient error (DB down) — don't clear user state
        if (err?.statusCode === 503 || err?.status === 503) {
          console.warn('[useAuth] Service temporarily unavailable, keeping session')
          return null // keep existing user state
        }
        // 401 = session expired — clear user
        if (err?.statusCode === 401 || err?.status === 401) {
          user.value = null
          return null
        }
        // Other errors — log but keep session
        console.error('Auth check failed:', err)
        return null
      })

      if (data?.user) {
        user.value = data.user
        return data.user
      }
      // Only clear user on explicit failure, not on null (transient)
      return user.value
    } finally {
      isLoading.value = false
    }
  }
  
  // Logout
  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
      navigateTo('/')
    }
  }

  const register = async (input: { name: string; email: string; password: string; inviteToken?: string }) => {
    isLoading.value = true
    try {
      const data = await apiFetch<{ user?: User }>('/api/auth/register', { method: 'POST', body: input })
      if (data.user) user.value = data.user
      return { success: true as const }
    } catch (err: any) {
      return { success: false as const, error: err?.data?.statusMessage || err?.message || 'Registration failed' }
    } finally {
      isLoading.value = false
    }
  }

  const forgotPassword = async (email: string) => {
    try {
      await apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } })
      return { success: true as const }
    } catch (err: any) {
      return { success: false as const, error: err?.data?.statusMessage || err?.message || 'Failed to send reset email' }
    }
  }

  const resetPassword = async (token: string, password: string) => {
    try {
      await apiFetch('/api/auth/reset-password', { method: 'POST', body: { token, password } })
      return { success: true as const }
    } catch (err: any) {
      return { success: false as const, error: err?.data?.statusMessage || err?.message || 'Failed to reset password' }
    }
  }
  
  // Redirect if not authenticated
  const requireAuth = async () => {
    if (!isAuthenticated.value && !isLoading.value) {
      const user = await fetchUser()
      if (!user) {
        navigateTo('/auth/login')
        return false
      }
    }
    return true
  }
  
  // Redirect if not authorized
  const requireRole = async (roles: readonly string[]) => {
    await requireAuth()
    if (!hasRole(roles)) {
      navigateTo('/')
      return false
    }
    return true
  }
  
  return {
    user: readonly(user),
    isAuthenticated: readonly(isAuthenticated),
    isLoading: readonly(isLoading),
    loading: readonly(isLoading),
    userRole,
    isOwner,
    isAdmin,
    isManager,
    isLead,
    isReadOnly,
    canWrite,
    canAccessFinance,
    canAccessInvoices,
    canAccessSales,
    canAccessClients,
    canAccessCreative,
    canAccessPageStudio,
    canAccessMediaBuying,
    canAccessAdmin,
    canAccessHr,
    canAccessAiTraining,
    canAccessTimeApprovals,
    canAccessAutomation,
    canAccessReports,
    userPermissionGroups,
    hasPermission,
    hasRole,
    fetchUser,
    register,
    forgotPassword,
    resetPassword,
    logout,
    requireAuth,
    requireRole
  }
}
