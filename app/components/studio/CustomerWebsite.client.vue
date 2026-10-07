<script setup lang="ts">
import { standaloneWorkspacePages, type StandaloneSiteWorkspace } from '~~/shared/pageStudio/standaloneWorkspace'

const api = '/api/portal/page-studio/customer'
const { data, pending, error, refresh } = useFetch<StandaloneSiteWorkspace>(`${api}/website`, { server: false, immediate: false, timeout: 10000, getCachedData: () => undefined })
// This native session is verified by each fresh workspace request.
data.value = null
const busy = ref(false)
const dirty = ref(false)
const actionError = ref('')
watch(error, (value) => {
  if (!value) return
  data.value = null
  if (value.statusCode === 401) void navigateTo('/studio/signup', { replace: true })
}, { flush: 'sync' })
const workspace = computed(() => !error.value ? data.value : null)
const pages = computed(() => workspace.value ? standaloneWorkspacePages(workspace.value.document) : [])
useHead({ title: () => `${workspace.value?.document.site.name ?? 'Your website'} — Forms` })
async function load() {
  if (busy.value || dirty.value) return
  busy.value = true
  try {
    await refresh()
    if (error.value) data.value = null
  } finally { busy.value = false }
}
onMounted(load)
async function signOut() {
  if (busy.value || dirty.value) return
  busy.value = true
  actionError.value = ''
  try {
    await $fetch(`${api}/logout`, { method: 'POST', body: {} })
    data.value = null
    await navigateTo('/studio/signup')
  } catch {
    actionError.value = 'We could not sign you out. Please try again.'
  } finally { busy.value = false }
}
</script>

<template>
  <StudioCustomerShell
    wide
    compact
    :title="workspace?.document.site.name || 'Your website'"
    description="Website forms and email settings."
  >
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          to="/studio/dashboard"
          label="Website overview"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          :disabled="dirty || busy"
        />
        <UButton
          label="Sign out"
          color="neutral"
          variant="outline"
          :disabled="dirty || busy"
          @click="signOut"
        />
      </div>
    </template>
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted" role="status">
        {{ dirty ? 'Save or discard your changes before leaving or refreshing.' : 'Saved drafts do not change your live website or send email.' }}
      </p>
      <UButton
        label="Refresh"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="busy"
        :disabled="dirty"
        @click="load"
      />
    </div>
    <UAlert
      v-if="actionError"
      class="mb-5"
      color="error"
      :title="actionError"
    />
    <div
      v-if="pending && !workspace"
      class="space-y-4"
      aria-busy="true"
      aria-label="Loading forms"
    >
      <USkeleton class="h-8 w-48" />
      <USkeleton class="h-72 w-full" />
    </div>
    <UAlert
      v-else-if="!workspace"
      color="neutral"
      variant="soft"
      title="Forms are unavailable"
      description="Your website’s form settings are not ready to open. Return to your overview to check setup, or refresh to check your access again."
    />
    <div v-else class="min-w-0 rounded-xl border border-default p-4 sm:p-6">
      <p v-if="!workspace.canEdit" class="mb-5 text-sm text-muted" role="status">
        You can review these form drafts. Editing is not available with your current access.
      </p>
      <PageStudioCustomerFormsWorkspace
        :key="`customer:${workspace.document.site.id}`"
        api-audience="customer"
        :site-id="workspace.document.site.id"
        :can-edit="workspace.canEdit"
        :assets="workspace.assets"
        :pages="pages"
        :checkpoint-id="workspace.document.studio?.checkpointId"
        :form-library="workspace.document.studio?.formLibrary"
        :reload-workspace="refresh"
        @dirty="dirty = $event"
        @reload="refresh()"
      />
    </div>
  </StudioCustomerShell>
</template>
