<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: 'auth' })
useHead({ title: 'Website CMS access | XeroFlow' })
const route = useRoute()
const siteId = computed(() => String(route.params.siteId || ''))
type CmsRole = 'editor' | 'viewer' | 'none'
interface CmsUser { id: string, name: string, email: string, status: string, role: Exclude<CmsRole, 'none'> | null }
const { data, pending, error, refresh } = await useFetch<{ name: string, cmsUrl: string, users: CmsUser[] }>(() => `/api/agency/page-studio/sites/${siteId.value}/members`)
const roles = [{ label: 'No access', value: 'none' }, { label: 'View website', value: 'viewer' }, { label: 'Edit website', value: 'editor' }]
const selected = ref<Record<string, CmsRole>>({})
const saving = ref<string | null>(null)
const toast = useToast()
watch(data, (value) => {
  selected.value = Object.fromEntries((value?.users ?? []).map(user => [user.id, user.role ?? 'none']))
}, { immediate: true })
async function save(user: CmsUser) {
  if (saving.value) return
  saving.value = user.id
  try {
    await $fetch(`/api/agency/page-studio/sites/${siteId.value}/members`, { method: 'PUT', body: { userId: user.id, role: selected.value[user.id] } })
    toast.add({ title: 'CMS access saved', description: `${user.name}'s website access has been updated.`, color: 'success' })
    await refresh()
  } catch (caught: unknown) {
    const message = (caught as { data?: { statusMessage?: string } })?.data?.statusMessage
    toast.add({ title: 'CMS access could not be saved', description: message || 'Refresh and try again.', color: 'error' })
  } finally { saving.value = null }
}
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto p-4 sm:p-6">
    <main class="mx-auto max-w-4xl space-y-6">
      <UButton
        to="/agency/page-studio"
        label="Client websites"
        icon="i-lucide-arrow-left"
        variant="link"
        color="neutral"
        class="px-0"
      />
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold text-highlighted">
            CMS access
          </h1>
          <p class="mt-2 text-muted">
            {{ !error && data?.name || 'Website' }}
          </p>
        </div>
        <UButton
          v-if="data && !error"
          :to="data.cmsUrl"
          external
          target="_blank"
          label="Open CMS"
          icon="i-lucide-external-link"
          color="neutral"
          variant="outline"
        />
      </header>
      <p class="max-w-2xl text-sm leading-6 text-muted">
        Assign website access to an invited client user. They sign in with their own email link.
        Agency dashboard sign-in is separate from CMS sign-in.
      </p>
      <UAlert
        v-if="error"
        title="CMS access unavailable"
        :description="error.data?.statusMessage || 'An agency administrator must manage access for this website.'"
        color="error"
      />
      <div v-else-if="pending && !data" role="status" class="text-muted">
        Loading website access…
      </div>
      <template v-else-if="data">
        <UAlert
          v-if="!data.users.length"
          title="No client users invited"
          description="Invite a user to this website’s client, then return here to assign access."
          color="neutral"
          variant="subtle"
        />
        <div v-for="user in data.users" :key="user.id" class="@container border-t border-default py-5">
          <div class="flex flex-col gap-4 @lg:flex-row @lg:items-end @lg:justify-between">
            <div class="min-w-0">
              <h2 class="font-medium text-highlighted">
                {{ user.name }}
              </h2>
              <p class="mt-1 break-all text-sm text-muted">
                {{ user.email }}
              </p>
              <p class="mt-2 text-sm text-muted">
                {{ user.status === 'pending' ? 'Invitation pending — email verification required' : user.status }}
              </p>
            </div>
            <div class="flex items-end gap-3 @lg:w-80 @lg:shrink-0">
              <UFormField :label="`Access for ${user.name}`" class="min-w-0 flex-1">
                <USelect
                  v-model="selected[user.id]"
                  :items="roles"
                  :disabled="Boolean(saving)"
                  class="w-full"
                />
              </UFormField>
              <UButton
                label="Save"
                :loading="saving === user.id"
                :disabled="Boolean(saving) || selected[user.id] === (user.role || 'none')"
                @click="save(user)"
              />
            </div>
          </div>
        </div>
        <UButton
          to="/agency/client-portal"
          label="Manage client invitations"
          variant="outline"
          color="neutral"
          icon="i-lucide-user-plus"
        />
      </template>
    </main>
  </div>
</template>
