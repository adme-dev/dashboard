import type { User } from '~/types'

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}

// Global auth error handler for API calls
export const setupAuthErrorHandler = () => {
  const router = useRouter()
  
  // Add response interceptor for all $fetch calls
  globalThis.$fetch = globalThis.$fetch.create?.({
    onResponseError({ response }) {
      if (response.status === 401) {
        // Redirect to login instead of showing error
        const currentPath = window.location.pathname
        router.push(`/login?redirect=${encodeURIComponent(currentPath)}&expired=true`)
      }
    }
  }) || globalThis.$fetch
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
      const data = await $fetch('/api/auth/me', {
        // Don't throw on 401, handle gracefully
        ignoreResponseError: true
      })
      
      if (data?.user) {
        user.value = data.user
        return data.user
      } else {
        user.value = null
        return null
      }
    } catch (error: any) {
      // If 401, user is not authenticated - this is expected
      if (error.statusCode === 401) {
        user.value = null
        return null
      }
      // For other errors, log but still return null
      console.error('Auth check failed:', error)
      user.value = null
      return null
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
      navigateTo('/login')
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
