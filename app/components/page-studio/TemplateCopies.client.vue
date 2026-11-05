<script setup lang="ts">
import { openCustomerStudio } from '~/utils/pageStudioCustomerLaunch'
interface Copy { siteId: string, name: string, requestId: string, versionId: string, canOpen: boolean, canResume: boolean, status: 'preparing' | 'ready' }
const { data, error, pending, refresh } = await useFetch<{ items: Copy[] }>('/api/portal/page-studio/customer/template-copies', { default: () => ({ items: [] }) })
const actions = useTemplateRef<{ resumeCopy: (requestId: string) => Promise<void> }>('actions')
const opening = ref<string | null>(null)
const message = ref('')
async function openCopy(copy: Copy) {
  if (opening.value || !copy.canOpen || error.value) return
  opening.value = copy.siteId
  message.value = ''
  try {
    const session = await $fetch<{ token: string, editorOrigin: string, expiresAt: string }>(`/api/portal/page-studio/customer/sites/${copy.siteId}/template-editor`, { method: 'POST', body: {} })
    openCustomerStudio(session)
  } catch {
    message.value = 'Your saved copy could not open yet. Refresh and try again to check account access and editor readiness.'
  } finally { opening.value = null }
}
defineExpose({ refresh })
</script>

<template>
  <section aria-label="My template copies" class="space-y-4 border-t border-default pt-6">
    <h2 class="text-xl font-semibold text-highlighted">My template copies</h2>
    <UAlert v-if="error" color="warning" title="Copies could not be loaded" description="Refresh to check your current account access." />
    <UAlert v-if="message" color="warning" title="Copy saved" :description="message" />
    <p v-if="pending" role="status">Loading saved copies…</p>
    <ul v-else-if="!error && data?.items.length" class="divide-y divide-default">
      <li v-for="copy in data.items" :key="copy.siteId" class="flex flex-wrap items-center justify-between gap-3 py-4">
        <span>{{ copy.name }}<span v-if="copy.status === 'preparing'" class="ml-2 text-muted">Preparing</span></span>
        <UButton v-if="copy.canResume" label="Resume copy" :disabled="!!opening" @click="actions?.resumeCopy(copy.requestId)" />
        <UButton v-else label="Open copy" :disabled="!copy.canOpen || !!opening" :loading="opening === copy.siteId" @click="openCopy(copy)" />
      </li>
    </ul>
    <p v-else-if="!error" class="text-muted">Saved template copies will appear here.</p>
    <UButton label="Refresh copies" color="neutral" variant="ghost" :disabled="!!opening" @click="refresh()" />
    <PageStudioTemplateActions ref="actions" endpoint="/api/portal/page-studio/customer/templates" @changed="refresh()" />
  </section>
</template>
