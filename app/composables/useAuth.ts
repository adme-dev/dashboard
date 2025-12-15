/**
 * Authentication Composable
 * Handles user authentication state and actions
 */

interface User {
  id: string
  name: string
  email: string
  jobRole: string | null
  userRole: string
  avatarUrl: string | null
  isActive: boolean
  emailVerified: boolean
  emailVerifiedAt: string | null
  timezone: string | null
  locale: string | null
  departments: {
    id: string
    name: string
    color: string
    role: string
    isPrimary: boolean
  }[]
}

interface LoginCredentials {
  email: string
  password: string
  rememberMe?: boolean
}

interface RegisterData {
  name: string
  email: string
  password: string
  inviteToken?: string
}

export function useAuth() {
  const user = useState<User | null>('auth-user', () => null)
  const loading = useState('auth-loading', () => false)
  const initialized = useState('auth-initialized', () => false)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => ['admin', 'owner'].includes(user.value?.userRole || ''))
  const isOwner = computed(() => user.value?.userRole === 'owner')

  /**
   * Fetch current user from session
   */
  async function fetchUser() {
    try {
      loading.value = true
      const data = await $fetch<{ user: User }>('/api/auth/me')
      user.value = data.user
    } catch (error: any) {
      user.value = null
      // Only log non-auth errors
      if (error.statusCode !== 401) {
        console.error('Failed to fetch user:', error)
      }
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  /**
   * Login with email and password
   */
  async function login(credentials: LoginCredentials) {
    loading.value = true
    try {
      const data = await $fetch<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: credentials
      })
      user.value = data.user
      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        error: error.data?.statusMessage || 'Login failed'
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * Register a new user
   */
  async function register(data: RegisterData) {
    loading.value = true
    try {
      const response = await $fetch<{ user: User }>('/api/auth/register', {
        method: 'POST',
        body: data
      })
      user.value = response.user
      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        error: error.data?.statusMessage || 'Registration failed'
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * Logout current user
   */
  async function logout() {
    loading.value = true
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
      user.value = null
      navigateTo('/auth/login')
    } catch (error) {
      console.error('Logout error:', error)
      // Clear user anyway
      user.value = null
      navigateTo('/auth/login')
    } finally {
      loading.value = false
    }
  }

  /**
   * Request password reset
   */
  async function forgotPassword(email: string) {
    try {
      const data = await $fetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: { email }
      })
      return { success: true, message: data.message }
    } catch (error: any) {
      return {
        success: false,
        error: error.data?.statusMessage || 'Failed to send reset email'
      }
    }
  }

  /**
   * Reset password with token
   */
  async function resetPassword(token: string, password: string) {
    try {
      const data = await $fetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: { token, password }
      })
      return { success: true, message: data.message }
    } catch (error: any) {
      return {
        success: false,
        error: error.data?.statusMessage || 'Failed to reset password'
      }
    }
  }

  /**
   * Check if user has a specific role
   */
  function hasRole(roles: string | string[]) {
    if (!user.value) return false
    const roleArray = Array.isArray(roles) ? roles : [roles]
    return roleArray.includes(user.value.userRole)
  }

  /**
   * Check if user belongs to a department
   */
  function inDepartment(departmentId: string) {
    if (!user.value) return false
    return user.value.departments.some(d => d.id === departmentId)
  }

  /**
   * Check if user is in the sales department
   */
  const isSalesDepartment = computed(() => {
    if (!user.value) return false
    return user.value.departments.some(d => d.name.toLowerCase() === 'sales')
  })

  /**
   * Check if user is a sales role
   */
  const isSalesRole = computed(() => {
    return user.value?.userRole === 'sales'
  })

  /**
   * Check if user can access pricing/quotes
   */
  const canAccessPricing = computed(() => {
    if (!user.value) return false
    // Owners and admins always have access
    if (['owner', 'admin'].includes(user.value.userRole)) return true
    // Sales role has access
    if (user.value.userRole === 'sales') return true
    // Sales department members have access
    if (isSalesDepartment.value) return true
    return false
  })

  return {
    user,
    loading,
    initialized,
    isAuthenticated,
    isAdmin,
    isOwner,
    isSalesRole,
    isSalesDepartment,
    canAccessPricing,
    fetchUser,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
    hasRole,
    inDepartment
  }
}
