<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { user, fetchUser } = usePortalAuth()
const toast = useToast()
const saving = ref(false)

const form = reactive({
  name: user.value?.name || '',
  phone: user.value?.phone || '',
  title: user.value?.title || '',
  timezone: user.value?.timezone || 'UTC'
})

// Sync form when user loads
watch(() => user.value, (u) => {
  if (u) {
    form.name = u.name
    form.phone = u.phone || ''
    form.title = u.title || ''
    form.timezone = u.timezone || 'UTC'
  }
}, { immediate: true })

const timezoneOptions = [
  { label: 'UTC', value: 'UTC' },
  { label: 'Australia/Sydney (AEST)', value: 'Australia/Sydney' },
  { label: 'Australia/Melbourne', value: 'Australia/Melbourne' },
  { label: 'Australia/Brisbane', value: 'Australia/Brisbane' },
  { label: 'Australia/Perth (AWST)', value: 'Australia/Perth' },
  { label: 'Pacific/Auckland (NZST)', value: 'Pacific/Auckland' },
  { label: 'America/New_York (EST)', value: 'America/New_York' },
  { label: 'America/Los_Angeles (PST)', value: 'America/Los_Angeles' },
  { label: 'Europe/London (GMT)', value: 'Europe/London' },
  { label: 'Asia/Singapore (SGT)', value: 'Asia/Singapore' },
  { label: 'Asia/Tokyo (JST)', value: 'Asia/Tokyo' }
]

const permissionModules = computed(() => [
  {
    key: 'jobs',
    label: 'Jobs',
    description: 'Booked jobs, project timelines, tasks, and job history.',
    icon: 'i-lucide-folder-kanban',
    enabled: user.value?.permissions?.canViewProjects !== false,
    to: '/portal/projects'
  },
  {
    key: 'billing',
    label: 'Billing',
    description: 'Current billing, outstanding invoices, and paid invoice history.',
    icon: 'i-lucide-receipt-text',
    enabled: Boolean(user.value?.permissions?.canViewInvoices),
    to: '/portal/invoices'
  },
  {
    key: 'analytics',
    label: 'Campaign analytics',
    description: 'Campaign performance, portal-visible leads, reports, and exports.',
    icon: 'i-lucide-chart-no-axes-combined',
    enabled: Boolean(user.value?.permissions?.canViewAnalytics),
    to: '/portal/analytics'
  },
  {
    key: 'approvals',
    label: 'Approvals',
    description: 'Review work, approve deliverables, and request revisions.',
    icon: 'i-lucide-check-check',
    enabled: Boolean(user.value?.permissions?.canApproveWork),
    to: '/portal/approvals'
  },
  {
    key: 'requests',
    label: 'Requests',
    description: 'Submit briefs, job requests, and support tickets.',
    icon: 'i-lucide-message-square-plus',
    enabled: Boolean(user.value?.permissions?.canSubmitRequests),
    to: '/portal/requests'
  },
  {
    key: 'budgets',
    label: 'Budgets',
    description: 'Budget and commercial project visibility.',
    icon: 'i-lucide-badge-dollar-sign',
    enabled: Boolean(user.value?.permissions?.canViewBudgets)
  },
  {
    key: 'time',
    label: 'Time entries',
    description: 'Time tracked against projects and tasks.',
    icon: 'i-lucide-timer',
    enabled: Boolean(user.value?.permissions?.canViewTimeEntries)
  }
])

const enabledModuleCount = computed(() => permissionModules.value.filter(module => module.enabled).length)

async function saveProfile() {
  saving.value = true
  try {
    await $fetch('/api/portal/profile', {
      method: 'PUT',
      body: {
        name: form.name,
        title: form.title,
        phone: form.phone,
        timezone: form.timezone
      }
    })
    toast.add({ title: 'Profile saved', color: 'success' })
    await fetchUser()
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'data' in error
      ? (error as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Failed to save', description: message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          Settings
        </h1>
        <p class="text-sm text-muted mt-1">
          Profile, account details, and portal module access for {{ user?.clientName }}.
        </p>
      </div>
      <UBadge color="primary" variant="subtle">
        {{ enabledModuleCount }}/{{ permissionModules.length }} modules enabled
      </UBadge>
    </div>

    <!-- Profile -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Profile
        </h2>
      </template>

      <form class="space-y-4" @submit.prevent="saveProfile">
        <div class="space-y-2">
          <label class="text-sm font-medium">Name</label>
          <UInput v-model="form.name" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Email</label>
          <UInput :model-value="user?.email" disabled />
          <p class="text-xs text-muted">
            Contact support to change your email.
          </p>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Title</label>
          <UInput v-model="form.title" placeholder="e.g. Marketing Manager" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Phone</label>
          <UInput v-model="form.phone" type="tel" placeholder="+61 400 000 000" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Timezone</label>
          <USelect v-model="form.timezone" :items="timezoneOptions" />
        </div>

        <div class="flex justify-end">
          <UButton type="submit" :loading="saving">
            Save Changes
          </UButton>
        </div>
      </form>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold">
            Portal Access
          </h2>
          <UBadge color="neutral" variant="subtle">
            Managed by agency
          </UBadge>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="module in permissionModules"
          :key="module.key"
          class="rounded-lg border border-default bg-default p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              <div class="size-9 rounded-lg bg-elevated flex items-center justify-center shrink-0">
                <UIcon :name="module.icon" class="size-4 text-primary" />
              </div>
              <div class="min-w-0">
                <p class="font-medium">
                  {{ module.label }}
                </p>
                <p class="text-sm text-muted mt-1 leading-relaxed">
                  {{ module.description }}
                </p>
              </div>
            </div>
            <UBadge :color="module.enabled ? 'success' : 'neutral'" variant="subtle" size="xs">
              {{ module.enabled ? 'Enabled' : 'Disabled' }}
            </UBadge>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <UButton
              v-if="module.enabled && module.to"
              :to="module.to"
              icon="i-lucide-arrow-right"
              variant="outline"
              color="neutral"
              size="sm"
            >
              Open
            </UButton>
            <UButton
              v-if="!module.enabled && user?.permissions?.canSubmitRequests"
              :to="`/portal/requests?access=${module.key}`"
              icon="i-lucide-message-square-plus"
              color="primary"
              variant="soft"
              size="sm"
            >
              Request access
            </UButton>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Account Info -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Account
        </h2>
      </template>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">
              Role
            </p>
            <p class="text-sm text-muted capitalize">
              {{ user?.role }}
            </p>
          </div>
          <UBadge variant="subtle" color="neutral">
            {{ user?.role }}
          </UBadge>
        </div>

        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">
              Organization
            </p>
            <p class="text-sm text-muted">
              {{ user?.clientName }}
            </p>
          </div>
        </div>

        <div v-if="user?.isPrimaryContact" class="flex items-center gap-2">
          <UBadge color="primary" variant="subtle" size="xs">
            Primary Contact
          </UBadge>
        </div>
      </div>
    </UCard>
  </div>
</template>
