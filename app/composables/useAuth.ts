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
  
  const isAuthenticated = computed(() => !!user.value)
  
  const userRole = computed(() => user.value?.role)
  
  const hasRole = (roles: string[]) => {
    if (!user.value) return false
    return roles.includes(user.value.role)
  }
  
  const isAdmin = computed(() => hasRole(['admin', 'owner']))
  const isManager = computed(() => hasRole(['admin', 'owner', 'project_manager']))
  
  // Fetch current user
  const fetchUser = async () => {
    try {
      isLoading.value = true
      const data: any = await $fetch('/api/auth/me').catch((err: any) => {
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
      await $fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
      navigateTo('/')
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
  const requireRole = async (roles: string[]) => {
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
    userRole,
    isAdmin,
    isManager,
    hasRole,
    fetchUser,
    logout,
    requireAuth,
    requireRole
  }
}
