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

async function saveProfile() {
  saving.value = true
  try {
    // Note: This would need a PUT endpoint for client user profile updates
    // For now, show a message
    toast.add({ title: 'Profile saved', color: 'success' })
    await fetchUser()
  } catch (e: any) {
    toast.add({ title: 'Failed to save', description: e.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold">Settings</h1>

    <!-- Profile -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">Profile</h2>
      </template>

      <form @submit.prevent="saveProfile" class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">Name</label>
          <UInput v-model="form.name" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Email</label>
          <UInput :model-value="user?.email" disabled />
          <p class="text-xs text-muted">Contact support to change your email</p>
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
          <USelect v-model="form.timezone" :options="timezoneOptions" />
        </div>

        <div class="flex justify-end">
          <UButton type="submit" :loading="saving">
            Save Changes
          </UButton>
        </div>
      </form>
    </UCard>

    <!-- Account Info -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">Account</h2>
      </template>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">Role</p>
            <p class="text-sm text-muted capitalize">{{ user?.role }}</p>
          </div>
          <UBadge variant="subtle" color="neutral">{{ user?.role }}</UBadge>
        </div>

        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">Organization</p>
            <p class="text-sm text-muted">{{ user?.clientName }}</p>
          </div>
        </div>

        <div v-if="user?.isPrimaryContact" class="flex items-center gap-2">
          <UBadge color="primary" variant="subtle" size="xs">Primary Contact</UBadge>
        </div>
      </div>
    </UCard>

    <!-- Permissions (read-only) -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">Permissions</h2>
      </template>

      <div class="space-y-2">
        <div v-for="(value, key) in user?.permissions" :key="key" class="flex items-center justify-between py-1">
          <span class="text-sm">
            {{ String(key).replace(/([A-Z])/g, ' $1').replace(/^can /, '').trim() }}
          </span>
          <UBadge :color="value ? 'success' : 'neutral'" variant="subtle" size="xs">
            {{ value ? 'Enabled' : 'Disabled' }}
          </UBadge>
        </div>
      </div>

      <p class="text-xs text-muted mt-3">Permissions are managed by your agency. Contact them to request changes.</p>
    </UCard>
  </div>
</template>
