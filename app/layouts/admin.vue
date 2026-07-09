<template>
    <UDashboardGroup>
      <!-- Admin Sidebar -->
      <UDashboardSidebar
        id="admin"
        collapsible
        class="bg-elevated/25"
      >
        <template #header>
          <div class="flex items-center gap-2 px-4 py-3">
            <div class="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
              <UIcon name="i-lucide-shield" class="w-5 h-5 text-white" />
            </div>
            <span class="font-semibold">Admin</span>
          </div>
        </template>

        <UNavigationMenu
          orientation="vertical"
          :items="adminNavItems"
          tooltip
        />

        <template #footer>
          <div class="p-4 border-t border-default">
            <div class="flex items-center gap-3">
              <UAvatar
                v-if="user?.name"
                :alt="user.name"
                size="sm"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ user?.name }}</p>
                <p class="text-xs text-gray-500 truncate">{{ user?.email }}</p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-log-out"
                size="sm"
                @click="logout"
              />
            </div>
          </div>
        </template>
      </UDashboardSidebar>

      <!-- Main Content -->
      <slot />
    </UDashboardGroup>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

const { user, logout, isAuthenticated, fetchUser } = useAuth()
const router = useRouter()

// Check auth on mount
onMounted(async () => {
  const userData = await fetchUser()
  
  if (!userData) {
    // Not authenticated, redirect to login
    router.push({
      path: '/',
      query: { 
        redirect: encodeURIComponent(router.currentRoute.value.fullPath)
      }
    })
    return
  }
  
  // Check admin role
  if (!['admin', 'owner'].includes(userData.role)) {
    // Not an admin, redirect to appropriate home
    if (['consultant'].includes(userData.role)) {
      router.push('/xeroflow')
    } else {
      router.push('/agency')
    }
  }
})

const adminNavItems = [
  {
    label: 'Dashboard',
    icon: 'i-lucide-layout-dashboard',
    to: '/admin'
  },
  {
    label: 'Teams',
    icon: 'i-lucide-users',
    to: '/admin/teams'
  },
  {
    label: 'Users',
    icon: 'i-lucide-user-cog',
    to: '/admin/users'
  },
  {
    label: 'Roles & Permissions',
    icon: 'i-lucide-shield-check',
    to: '/admin/permissions'
  },
  {
    label: 'Settings',
    icon: 'i-lucide-settings',
    to: '/admin/settings'
  },
  {
    label: 'Connections',
    icon: 'i-lucide-plug',
    to: '/admin/connections/integrations'
  }
]
</script>
