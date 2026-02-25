import type { ClientUser, ClientPermissions } from '~/types'

export function usePortalAuth() {
  const user = useState<ClientUser | null>('portal-user', () => null)
  const isAuthenticated = computed(() => !!user.value)

  async function login(email: string, password: string) {
    const data = await $fetch<{ user: any; stats: any }>('/api/portal/auth/login', {
      method: 'POST',
      body: { email, password }
    })
    user.value = data.user as ClientUser
    return data
  }

  async function logout() {
    try {
      await $fetch('/api/portal/auth/logout', { method: 'POST' })
    } catch {}
    user.value = null
    await navigateTo('/portal/login')
  }

  async function fetchUser() {
    try {
      const data = await $fetch<{ user: any; client: any; stats: any }>('/api/portal/auth/me')
      user.value = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        title: data.user.title,
        phone: data.user.phone,
        avatarUrl: data.user.avatarUrl,
        role: data.user.role,
        isPrimaryContact: data.user.isPrimaryContact,
        clientId: data.client.id,
        clientName: data.client.name,
        clientLogo: data.client.logo,
        permissions: data.user.permissions,
        notificationPreferences: data.user.notificationPreferences || {},
        timezone: data.user.timezone || 'UTC'
      } as ClientUser
      return data
    } catch {
      user.value = null
      return null
    }
  }

  function hasPermission(key: keyof ClientPermissions) {
    return user.value?.permissions?.[key] ?? false
  }

  return { user, isAuthenticated, login, logout, fetchUser, hasPermission }
}
