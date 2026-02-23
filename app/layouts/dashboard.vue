<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Dashboard Navigation -->
    <nav class="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-[#13B5EA] rounded flex items-center justify-center text-white font-bold">
              X
            </div>
            <span class="font-semibold text-gray-900">XeroFlow</span>
          </div>

          <!-- Navigation Links -->
          <div class="hidden md:flex items-center gap-1">
            <NuxtLink 
              to="/dashboard" 
              class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              :class="{ 'bg-gray-100 text-gray-900': $route.path === '/dashboard' }"
            >
              Dashboard
            </NuxtLink>
            <NuxtLink 
              to="/dashboard/implementations" 
              class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              :class="{ 'bg-gray-100 text-gray-900': $route.path.includes('/implementations') }"
            >
              Implementations
            </NuxtLink>
            <NuxtLink 
              to="/dashboard/templates" 
              class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              :class="{ 'bg-gray-100 text-gray-900': $route.path.includes('/templates') }"
            >
              Templates
            </NuxtLink>
            <NuxtLink 
              v-if="isProjectManager"
              to="/dashboard/team" 
              class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              :class="{ 'bg-gray-100 text-gray-900': $route.path.includes('/team') }"
            >
              Team
            </NuxtLink>
          </div>

          <!-- User Menu -->
          <div class="flex items-center gap-4">
            <button class="relative p-2 text-gray-400 hover:text-gray-500">
              <UIcon name="i-lucide-bell" class="w-5 h-5" />
              <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            
            <UDropdown :items="userMenuItems">
              <button class="flex items-center gap-2 text-sm text-gray-700">
                <div class="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <UIcon name="i-lucide-user" class="w-4 h-4" />
                </div>
                <span class="hidden sm:block">{{ user?.name }}</span>
                <UIcon name="i-lucide-chevron-down" class="w-4 h-4" />
              </button>
            </UDropdown>
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
    navigateTo('/login')
  }
})
</script>
