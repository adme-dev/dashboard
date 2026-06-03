<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

interface Overview {
  counts: { published: number; scheduled: number; failed: number; drafts: number }
  metrics: { impressions: number; engagements: number; clicks: number }
}
const data = ref<Overview | null>(null)
const loading = ref(false)

async function load() {
  if (!clientId.value) return
  loading.value = true
  try { data.value = await $fetch<Overview>('/api/agency/social/publishing/analytics/overview', { query: { clientId: clientId.value } }) }
  finally { loading.value = false }
}
watch(clientId, load, { immediate: true })

const cards = computed(() => data.value ? [
  { label: 'Published', value: data.value.counts.published, icon: 'i-lucide-check-circle-2', color: 'text-success' },
  { label: 'Scheduled', value: data.value.counts.scheduled, icon: 'i-lucide-calendar-clock', color: 'text-primary' },
  { label: 'Drafts', value: data.value.counts.drafts, icon: 'i-lucide-file-text', color: 'text-muted' },
  { label: 'Failed', value: data.value.counts.failed, icon: 'i-lucide-alert-triangle', color: 'text-error' },
  { label: 'Impressions', value: data.value.metrics.impressions, icon: 'i-lucide-eye', color: 'text-default' },
  { label: 'Engagements', value: data.value.metrics.engagements, icon: 'i-lucide-heart', color: 'text-default' },
  { label: 'Clicks', value: data.value.metrics.clicks, icon: 'i-lucide-mouse-pointer-click', color: 'text-default' },
] : [])
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p class="text-sm text-muted mt-0.5">Top-line publishing performance. Deep reporting lands in a later slice.</p>
      </div>
      <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" label-key="label" icon="i-lucide-building-2" class="w-56" />
    </div>

    <SocialPublishingSectionNav />

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <div v-for="c in cards" :key="c.label" class="rounded-lg border border-default p-4">
        <div class="flex items-center gap-2 text-xs text-muted uppercase tracking-wide">
          <UIcon :name="c.icon" :class="c.color" class="size-4" />
          {{ c.label }}
        </div>
        <div class="mt-2 text-2xl font-semibold tabular-nums">{{ c.value.toLocaleString() }}</div>
      </div>
    </div>
    <p v-if="!cards.length && !loading" class="text-sm text-muted mt-4">No data yet.</p>
  </div>
</template>
