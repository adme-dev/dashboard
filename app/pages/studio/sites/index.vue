<script setup lang="ts">
import type { PageStudioSiteSummary } from '~/types'

definePageMeta({ layout: 'studio', middleware: 'studio-auth' })
useHead({ title: 'My sites | Page Studio' })
const page = ref(1)
const pageSize = 12
const { data, pending, error, refresh } = await useFetch<{ sites: PageStudioSiteSummary[], total: number }>('/api/portal/page-studio/sites', {
  query: computed(() => ({ page: page.value, pageSize })),
  default: () => ({ sites: [], total: 0 })
})
const { launchPageStudio, editorOrigin } = usePageStudioLauncher()
const launching = ref<string | null>(null)
const toast = useToast()
async function openStudio(siteId: string) {
  if (launching.value) return
  launching.value = siteId
  try {
    await launchPageStudio(siteId, 'portal')
  } catch {
    toast.add({ title: 'Studio could not open', description: 'Check your website editing access and allow pop-ups, then try again.', color: 'error' })
  } finally {
    launching.value = null
  }
}
</script>

<template>
  <section class="space-y-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold tracking-tight text-highlighted">
          My sites
        </h1>
        <p class="mt-3 text-muted">
          Choose a website to edit its pages or manage its content.
        </p>
      </div>
      <UButton
        label="Refresh"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="pending"
        @click="refresh()"
      />
    </div>
    <UAlert
      v-if="error"
      color="error"
      title="Your websites could not be loaded"
      description="Try refreshing. If access is unavailable, ask your website team to check your account."
    />
    <div
      v-else-if="pending && !data.sites.length"
      aria-label="Loading websites"
      aria-busy="true"
      class="space-y-4"
    >
      <USkeleton v-for="n in 3" :key="n" class="h-32 w-full rounded-lg" />
    </div>
    <UCard v-else-if="!data.sites.length">
      <div class="max-w-lg space-y-3 py-6">
        <UIcon name="i-lucide-panels-top-left" class="size-8 text-muted" />
        <h2 class="text-xl font-semibold text-highlighted">
          Your website workspace starts here
        </h2>
        <p class="leading-7 text-muted">
          No websites are assigned to this account yet. Ask your website team to add your access, then refresh this page.
        </p>
      </div>
    </UCard>
    <ul v-else class="divide-y divide-default border-y border-default">
      <li v-for="site in data.sites" :key="site.id" class="flex flex-col gap-5 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <h2 class="break-words text-xl font-medium text-highlighted">
            {{ site.name }}
          </h2>
          <p class="mt-2 text-sm text-muted">
            Website workspace
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <UButton
            :to="`/studio/sites/${site.id}/history`"
            label="Draft history"
            color="neutral"
            variant="ghost"
          />
          <UButton
            :to="`/studio/sites/${site.id}/content`"
            label="Manage content"
            color="neutral"
            variant="outline"
          />
          <UButton
            label="Open Studio"
            icon="i-lucide-external-link"
            :loading="launching === site.id"
            :disabled="!editorOrigin || !!launching"
            @click="openStudio(site.id)"
          />
        </div>
      </li>
    </ul>
    <UPagination
      v-if="data.total > pageSize"
      v-model:page="page"
      :total="data.total"
      :items-per-page="pageSize"
    />
    <p class="max-w-2xl text-sm leading-6 text-muted">
      Your edits are saved as drafts. Your website team reviews and publishes changes. Studio opens in a new tab; return here to manage your content.
    </p>
  </section>
</template>
