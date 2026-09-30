<script setup lang="ts">
import type { PageStudioSiteSummary } from '~/types'

definePageMeta({ layout: 'studio', middleware: 'studio-auth' })
useHead({ title: 'Image credits | Page Studio' })
const page = ref(1)
const pageSize = 100
const route = useRoute()
const selected = ref(typeof route.query.site === 'string' ? route.query.site : '__choose__')
const { data, pending, error, refresh } = await useFetch<{ sites: PageStudioSiteSummary[], total: number }>('/api/portal/page-studio/sites', {
  query: computed(() => ({ page: page.value, pageSize })),
  default: () => ({ sites: [], total: 0 })
})
const options = computed(() => data.value.sites.map(site => ({ label: site.name, value: site.id })))
watch(() => data.value.sites, (sites) => {
  if (!sites.some(site => site.id === selected.value)) selected.value = sites[0]?.id ?? '__choose__'
}, { immediate: true })
const site = computed(() => !error.value && !pending.value ? data.value.sites.find(item => item.id === selected.value) : undefined)
</script>

<template>
  <section class="space-y-8">
    <div class="max-w-2xl">
      <h1 class="text-3xl font-semibold tracking-tight text-highlighted">
        Image credits
      </h1>
      <p class="mt-3 leading-7 text-muted">
        Check your balance and image activity. Choose a website to view the credit account it belongs to.
      </p>
    </div>
    <UAlert
      v-if="error"
      color="error"
      title="Your websites could not be loaded"
      description="Refresh to check your current access."
    />
    <USkeleton v-else-if="pending" class="h-24 w-full rounded-lg" />
    <template v-else-if="data.sites.length">
      <UFormField label="Website" class="max-w-md">
        <USelectMenu
          v-model="selected"
          :items="options"
          value-key="value"
          label-key="label"
          aria-label="Website"
          class="w-full"
        />
      </UFormField>
      <UPagination
        v-if="data.total > pageSize"
        v-model:page="page"
        :total="data.total"
        :items-per-page="pageSize"
      />
      <PageStudioImageCreditSummary v-if="site" :key="site.id" :site-id="site.id" />
    </template>
    <UAlert
      v-else
      color="neutral"
      title="No websites are assigned yet"
      description="Ask your website team to add your access before viewing image credits."
    />
    <UButton
      v-if="error"
      label="Refresh websites"
      color="neutral"
      variant="outline"
      @click="refresh()"
    />
  </section>
</template>
