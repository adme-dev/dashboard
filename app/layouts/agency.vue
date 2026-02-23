<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const open = ref(false)
const selectedWorkspace = ref<string | null>(null)

// Fetch workspaces
const { data: workspacesData } = await useFetch('/api/agency/workspaces')
const workspaces = computed(() => workspacesData.value?.workspaces || [])

// Build navigation from workspaces
const workspaceNav = computed(() => {
  return workspaces.value.map((ws: any) => ({
    label: ws.name,
    icon: `i-lucide-${ws.icon || 'briefcase'}`,
    to: `/agency/w/${ws.slug}`,
    badge: ws.stats?.boards?.toString(),
    onSelect: () => { 
      open.value = false
      selectedWorkspace.value = ws.id
    },
    // Children are the boards in this workspace
    children: ws.boards?.map((board: any) => ({
      label: board.name,
      to: `/agency/boards/${board.slug}`,
      badge: board.taskCount > 0 ? board.taskCount.toString() : undefined,
      onSelect: () => { open.value = false }
    })) || []
  })) as NavigationMenuItem[]
})

// Bottom links
const bottomLinks = [{
  label: 'All Boards',
  icon: 'i-lucide-layout-grid',
  to: '/agency/boards',
  onSelect: () => { open.value = false }
}, {
  label: 'Teams',
  icon: 'i-lucide-users',
  to: '/agency/teams',
  onSelect: () => { open.value = false }
}, {
  label: 'Admin',
  icon: 'i-lucide-shield',
  children: [{
    label: 'User Management',
    icon: 'i-lucide-users',
    to: '/admin/users',
    onSelect: () => { open.value = false }
  }, {
    label: 'Teams',
    icon: 'i-lucide-users-round',
    to: '/admin/teams',
    onSelect: () => { open.value = false }
  }]
}, {
  label: 'Monday',
  icon: 'i-lucide-cloud',
  children: [{
    label: 'Migration',
    icon: 'i-lucide-arrow-left-right',
    to: '/agency/monday',
    onSelect: () => { open.value = false }
  }, {
    label: 'User Sync',
    icon: 'i-lucide-users',
    to: '/agency/monday/users',
    onSelect: () => { open.value = false }
  }]
}, {
  label: 'Settings',
  to: '/settings',
  icon: 'i-lucide-settings',
  onSelect: () => { open.value = false }
}]
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="agency"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-2">
          <UButton
            to="/agency/boards"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-left"
            size="sm"
          />
          <span v-if="!collapsed" class="font-semibold">Workspaces</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <!-- Workspace Selector -->
        <div class="px-2 py-2">
          <UButton
            v-if="!collapsed"
            color="primary"
            variant="soft"
            icon="i-lucide-plus"
            class="w-full justify-center"
          >
            New Board
          </UButton>
        </div>

        <!-- Workspace List -->
        <UNavigationMenu
          :collapsed="collapsed"
          :items="workspaceNav"
          orientation="vertical"
          tooltip
          popover
        />

        <!-- Bottom Links -->
        <UNavigationMenu
          :collapsed="collapsed"
          :items="bottomLinks"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
      <slot />
    </div>
  </UDashboardGroup>
</template>
