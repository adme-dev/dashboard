<template>
  <div class="p-6 max-w-5xl mx-auto">
    <h1 class="text-2xl font-bold mb-2">Integrations</h1>
    <p class="text-gray-500 mb-6">Connect your favorite tools and services</p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Monday.com -->
      <UCard>
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
            <UIcon name="i-lucide-layout-grid" class="w-6 h-6 text-purple-600" />
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Monday.com</h3>
              <UBadge v-if="mondayConnected" color="success" variant="subtle" size="sm">
                Connected
              </UBadge>
            </div>
            <p class="text-sm text-gray-500 mt-1">
              Sync boards, tasks, and updates from your Monday.com workspace
            </p>
            <div class="mt-4">
              <UButton
                :to="mondayConnected ? '/settings/integrations/monday' : '/settings/integrations/monday'"
                :variant="mondayConnected ? 'outline' : 'solid'"
                size="sm"
              >
                {{ mondayConnected ? 'Manage' : 'Connect' }}
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Xero -->
      <UCard>
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <UIcon name="i-lucide-calculator" class="w-6 h-6 text-blue-600" />
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Xero</h3>
              <UBadge v-if="xeroConnected" color="success" variant="subtle" size="sm">
                Connected
              </UBadge>
            </div>
            <p class="text-sm text-gray-500 mt-1">
              Sync invoices, contacts, and financial data from Xero
            </p>
            <div class="mt-4">
              <UButton
                to="/settings/integrations/xero"
                :variant="xeroConnected ? 'outline' : 'solid'"
                size="sm"
              >
                {{ xeroConnected ? 'Manage' : 'Connect' }}
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Slack (Coming Soon) -->
      <UCard class="opacity-60">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
            <UIcon name="i-lucide-hash" class="w-6 h-6 text-gray-600" />
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Slack</h3>
              <UBadge color="neutral" variant="subtle" size="sm">Coming Soon</UBadge>
            </div>
            <p class="text-sm text-gray-500 mt-1">
              Get notifications and updates in your Slack channels
            </p>
            <div class="mt-4">
              <UButton variant="outline" size="sm" disabled>
                Connect
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Google Calendar (Coming Soon) -->
      <UCard class="opacity-60">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
            <UIcon name="i-lucide-calendar" class="w-6 h-6 text-gray-600" />
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Google Calendar</h3>
              <UBadge color="neutral" variant="subtle" size="sm">Coming Soon</UBadge>
            </div>
            <p class="text-sm text-gray-500 mt-1">
              Sync deadlines and milestones with Google Calendar
            </p>
            <div class="mt-4">
              <UButton variant="outline" size="sm" disabled>
                Connect
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Analytics data export -->
      <UCard>
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <UIcon name="i-lucide-database" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div class="flex-1">
            <h3 class="font-semibold">Analytics data export</h3>
            <p class="text-sm text-muted mt-1">
              Mint API tokens to pull the canonical analytics fact into a warehouse or share with clients.
            </p>
            <div class="mt-4">
              <UButton to="/settings/integrations/analytics-export" variant="solid" size="sm">
                Manage
              </UButton>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const mondayConnected = ref(false)
const xeroConnected = ref(false)

onMounted(async () => {
  // Check Monday.com connection
  try {
    const mondayStatus = await $fetch('/api/agency/monday/connection')
    mondayConnected.value = mondayStatus.connected
  } catch {
    mondayConnected.value = false
  }

  // Check Xero connection
  try {
    const xeroStatus = await $fetch('/api/xero/status')
    xeroConnected.value = xeroStatus.connected
  } catch {
    xeroConnected.value = false
  }
})
</script>
