<script setup lang="ts">
import type { SocialInboxAnalytics } from '~/types'
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => { const d = clientsData.value as any; return Array.isArray(d) ? d : (d?.clients ?? []) })
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)
const days = ref(30)

const { data: a, pending } = await useFetch<SocialInboxAnalytics>('/api/agency/social/inbox/analytics/overview',
  { query: { clientId, days }, watch: [clientId, days], default: () => null as any })

const cards = computed(() => a.value ? [
  { label: 'Conversations', value: a.value.total },
  { label: 'Open', value: a.value.open },
  { label: 'Avg first response', value: `${a.value.avgFirstResponseMinutes}m` },
  { label: 'Within SLA', value: a.value.withinSlaPct == null ? '—' : `${a.value.withinSlaPct}%` },
  { label: 'SLA breaches', value: a.value.breaches },
  { label: 'Automation rate', value: `${a.value.automationRatePct}%` },
] : [])
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">Inbox Analytics</h1>
        <p class="text-sm text-muted">Response time, SLA and automation over the selected window.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Select client" class="w-56 max-w-full" />
        <USelect v-model="days" :items="[{ label: '7 days', value: 7 }, { label: '30 days', value: 30 }, { label: '90 days', value: 90 }]" value-key="value" class="w-32" />
      </div>
    </div>
    <SocialSuiteSectionNav />
    <div v-if="pending" class="text-sm text-muted">Loading…</div>
    <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4">
      <UCard v-for="c in cards" :key="c.label">
        <div class="text-2xl font-semibold">{{ c.value }}</div>
        <div class="text-sm text-muted">{{ c.label }}</div>
      </UCard>
    </div>
  </div>
</template>
