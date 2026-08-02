import type { ClientUser, ClientPermissions } from '~/types'

interface PortalStats {
  pendingApprovals: number
  unreadNotifications: number
  activeProjects: number
  openRequests: number
}

interface PortalAuthUserResponse {
  id: string
  email: string
  name: string
  title?: string | null
  phone?: string | null
  avatarUrl?: string | null
  role: string
  isPrimaryContact: boolean
  agencyAccess: boolean
  permissions: ClientPermissions
  notificationPreferences?: Record<string, unknown>
  timezone?: string
}

interface PortalAuthMeResponse {
  user: PortalAuthUserResponse
  client: {
    id: string
    name: string
    logo?: string | null
    leadCaptureMode: 'analytics_only' | 'capture_only' | 'lightweight_crm' | 'full_crm' | 'external_crm'
  }
  stats: PortalStats
  recentNotifications: Array<{
    id: string
    type: string
    title: string
    message: string
    actionUrl?: string | null
    isRead: boolean
    createdAt: string
  }>
}

interface PortalLoginResponse {
  user: ClientUser
  stats: PortalStats
}

export function usePortalAuth() {
  const user = useState<ClientUser | null>('portal-user', () => null)
  const stats = useState<PortalStats | null>('portal-stats', () => null)
  const isAuthenticated = computed(() => !!user.value)
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown }
  ) => Promise<T>

  async function login(email: string, password: string) {
    const data = await apiFetch<PortalLoginResponse>('/api/portal/auth/login', {
      method: 'POST',
      body: { email, password }
    })
    user.value = data.user
    stats.value = data.stats
    return data
  }

  async function logout() {
    try {
      await apiFetch('/api/portal/auth/logout', { method: 'POST' })
    } catch {
      // Clear local portal state even if the server session has already expired.
    }
    user.value = null
    stats.value = null
    await navigateTo('/portal/login')
  }

  async function fetchUser() {
    try {
      const data = await apiFetch<PortalAuthMeResponse>('/api/portal/auth/me')
      user.value = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        title: data.user.title,
        phone: data.user.phone,
        avatarUrl: data.user.avatarUrl,
        role: data.user.role,
        isPrimaryContact: data.user.isPrimaryContact,
        agencyAccess: data.user.agencyAccess,
        clientId: data.client.id,
        clientName: data.client.name,
        clientLogo: data.client.logo,
        leadCaptureMode: data.client.leadCaptureMode,
        permissions: {
          ...data.user.permissions,
          canNominateCompetitors: data.user.permissions.canNominateCompetitors ?? false
        },
        notificationPreferences: data.user.notificationPreferences || {},
        timezone: data.user.timezone || 'UTC'
      } as ClientUser
      stats.value = data.stats
      return data
    } catch {
      user.value = null
      stats.value = null
      return null
    }
  }

  function hasPermission(key: keyof ClientPermissions) {
    return user.value?.permissions?.[key] ?? false
  }

  return { user, stats, isAuthenticated, login, logout, fetchUser, hasPermission }
}
