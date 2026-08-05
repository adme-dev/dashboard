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
          <UTooltip
            v-if="isGodMode"
            text="All registered application and MCP capabilities are available. Authentication and session checks, exact active-owner authority, tenant, client and entity isolation, mandatory audit, emergency disable, provider bindings and secrets, and SSRF protections remain enforced."
            :content="{ side: 'right' }"
          >
            <UBadge color="warning" variant="soft" class="mb-3 flex w-full items-center justify-center gap-1.5">
              <UIcon name="i-lucide-crown" class="size-3.5" />
              God mode active
            </UBadge>
          </UTooltip>
          <div class="flex items-center gap-3">
            <UAvatar
              v-if="user?.name"
              :alt="user.name"
              size="sm"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">
                {{ user?.name }}
              </p>
              <p class="text-xs text-gray-500 truncate">
                {{ user?.email }}
              </p>
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

const { user, logout, fetchUser, isGodMode } = useAuth()

// Load the user for the sidebar footer. Access control lives in the
// role-admin route middleware (which understands custom roles via
// permission groups) — the hardcoded ['admin','owner'] check that used
// to live here ejected legitimate custom-role admins after mount.
onMounted(() => {
  if (!user.value) void fetchUser()
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
  }
]
</script>
