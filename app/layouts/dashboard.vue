<template>
  <div class="min-h-screen bg-[var(--ui-bg)]">
    <!-- Dashboard Navigation -->
    <nav class="bg-[var(--ui-bg-elevated)] border-b border-[var(--ui-border)] sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-[var(--ui-primary)] rounded flex items-center justify-center text-white font-bold">
              X
            </div>
            <span class="font-semibold text-[var(--ui-text-highlighted)]">XeroFlow</span>
          </div>

          <!-- Navigation Links -->
          <div class="hidden md:flex items-center gap-1">
            <NuxtLink
              to="/dashboard"
              class="px-3 py-2 rounded-md text-sm font-medium text-[var(--ui-text)] hover:text-[var(--ui-text-highlighted)] hover:bg-[var(--ui-bg-accented)]"
              :class="{ 'bg-[var(--ui-bg-accented)] text-[var(--ui-text-highlighted)]': $route.path === '/dashboard' }"
            >
              Dashboard
            </NuxtLink>
            <NuxtLink
              to="/dashboard/implementations"
              class="px-3 py-2 rounded-md text-sm font-medium text-[var(--ui-text)] hover:text-[var(--ui-text-highlighted)] hover:bg-[var(--ui-bg-accented)]"
              :class="{ 'bg-[var(--ui-bg-accented)] text-[var(--ui-text-highlighted)]': $route.path.includes('/implementations') }"
            >
              Implementations
            </NuxtLink>
            <NuxtLink
              to="/dashboard/templates"
              class="px-3 py-2 rounded-md text-sm font-medium text-[var(--ui-text)] hover:text-[var(--ui-text-highlighted)] hover:bg-[var(--ui-bg-accented)]"
              :class="{ 'bg-[var(--ui-bg-accented)] text-[var(--ui-text-highlighted)]': $route.path.includes('/templates') }"
            >
              Templates
            </NuxtLink>
            <NuxtLink
              v-if="isProjectManager"
              to="/dashboard/team"
              class="px-3 py-2 rounded-md text-sm font-medium text-[var(--ui-text)] hover:text-[var(--ui-text-highlighted)] hover:bg-[var(--ui-bg-accented)]"
              :class="{ 'bg-[var(--ui-bg-accented)] text-[var(--ui-text-highlighted)]': $route.path.includes('/team') }"
            >
              Team
            </NuxtLink>
          </div>

          <!-- User Menu -->
          <div class="flex items-center gap-4">
            <button class="relative p-2 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]">
              <UIcon name="i-lucide-bell" class="w-5 h-5" />
              <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            <UDropdownMenu :items="userMenuItems">
              <button class="flex items-center gap-2 text-sm text-[var(--ui-text)]">
                <div class="w-8 h-8 bg-[var(--ui-bg-accented)] rounded-full flex items-center justify-center">
                  <UIcon name="i-lucide-user" class="w-4 h-4" />
                </div>
                <span class="hidden sm:block">{{ user?.name }}</span>
                <UIcon name="i-lucide-chevron-down" class="w-4 h-4" />
              </button>
            </UDropdownMenu>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>
  </div>
</template>

<script setup>
const { user, isProjectManager, logout } = useAuth()

const userMenuItems = [
  [{
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/dashboard/profile'
  }, {
    label: 'Settings',
    icon: 'i-lucide-settings',
    to: '/dashboard/settings'
  }],
  [{
    label: 'Logout',
    icon: 'i-lucide-log-out',
    click: logout
  }]
]

// Protect dashboard routes
onMounted(async () => {
  const { fetchUser, isAuthenticated } = useAuth()
  await fetchUser()

  if (!isAuthenticated.value) {
    navigateTo('/')
  }
})
</script>
