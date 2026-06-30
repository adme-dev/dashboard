<script setup lang="ts">
import type { SocialInboxAnalytics } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

interface AgencyClientOption {
  id: string
  name: string
}

type AgencyClientsResponse = AgencyClientOption[] | { clients?: AgencyClientOption[] }

const { data: clientsData } = await useFetch<AgencyClientsResponse>('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<AgencyClientOption[]>(() => {
  const data = clientsData.value
  return Array.isArray(data) ? data : (data?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)
const days = ref(30)
const periodOptions = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 }
]

const { data: a, pending, error } = await useFetch<SocialInboxAnalytics | null>('/api/agency/social/inbox/analytics/overview',
  { query: { clientId, days }, watch: [clientId, days], default: () => null })

const cards = computed(() => a.value
  ? [
      { label: 'Conversations', value: formatNumber(a.value.total), detail: `${formatNumber(a.value.open)} open`, icon: 'i-lucide-inbox' },
      { label: 'Avg first response', value: `${a.value.avgFirstResponseMinutes}m`, detail: `${a.value.responseRatePct}% responded`, icon: 'i-lucide-timer' },
      { label: 'Within SLA', value: pctLabel(a.value.withinSlaPct), detail: `${formatNumber(a.value.breaches)} breaches`, icon: 'i-lucide-activity' },
      { label: 'Native conversion', value: `${a.value.conversionRatePct}%`, detail: `${formatNumber(a.value.converted)} linked cases`, icon: 'i-lucide-git-branch' },
      { label: 'Due soon', value: formatNumber(a.value.dueSoon), detail: `${formatNumber(a.value.overdueOpen)} overdue`, icon: 'i-lucide-clock-alert' },
      { label: 'Automation rate', value: `${a.value.automationRatePct}%`, detail: 'sent by autopilot', icon: 'i-lucide-bot' }
    ]
  : [])

const channelRows = computed(() => a.value?.byChannel ?? [])
const platformRows = computed(() => a.value?.byPlatform ?? [])

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-AU').format(value ?? 0)
}

function pctLabel(value: number | null | undefined) {
  return value == null ? '—' : `${value}%`
}

function barWidth(value: number, max: number) {
  if (!max) return '0%'
  return `${Math.max(4, Math.round((value / max) * 100))}%`
}

const maxChannelTotal = computed(() => Math.max(0, ...channelRows.value.map(row => row.total)))
const maxPlatformTotal = computed(() => Math.max(0, ...platformRows.value.map(row => row.total)))
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">
          Inbox Analytics
        </h1>
        <p class="text-sm text-muted">
          Response time, SLA, native work conversion and automation over the selected window.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelectMenu
          v-model="clientId"
          :items="clientOptions"
          value-key="value"
          placeholder="Select client"
          class="w-56 max-w-full"
        />
        <USelect
          v-model="days"
          :items="periodOptions"
          value-key="value"
          class="w-32"
        />
      </div>
    </div>
    <SocialSuiteSectionNav />

    <div v-if="pending" class="text-sm text-muted">
      Loading…
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Inbox analytics could not be loaded"
      description="Refresh the page or check the selected client connection."
    />
    <div v-else-if="a" class="space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <UCard v-for="c in cards" :key="c.label" :ui="{ body: 'p-4' }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-2xl font-semibold tabular-nums">
                {{ c.value }}
              </div>
              <div class="mt-1 text-sm font-medium">
                {{ c.label }}
              </div>
              <div class="mt-0.5 text-xs text-muted">
                {{ c.detail }}
              </div>
            </div>
            <UIcon :name="c.icon" class="size-5 text-primary shrink-0" />
          </div>
        </UCard>
      </div>

      <div class="grid gap-4 xl:grid-cols-3">
        <section class="rounded-lg border border-default bg-default p-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-git-branch" class="size-4 text-primary" />
            <h2 class="text-sm font-semibold">
              Native workflow conversion
            </h2>
          </div>
          <div class="mt-4 space-y-3">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="text-muted">Converted conversations</span>
              <span class="font-medium tabular-nums">{{ formatNumber(a.converted) }} / {{ formatNumber(a.total) }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded bg-elevated">
              <div class="h-full bg-primary" :style="{ width: `${a.conversionRatePct}%` }" />
            </div>
            <div class="grid grid-cols-2 gap-3 pt-1 text-sm">
              <div>
                <div class="text-xs text-muted">
                  Linked tasks
                </div>
                <div class="text-lg font-semibold tabular-nums">
                  {{ formatNumber(a.linkedTasks) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-muted">
                  Client requests
                </div>
                <div class="text-lg font-semibold tabular-nums">
                  {{ formatNumber(a.linkedClientRequests) }}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-default bg-default p-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-clock-alert" class="size-4 text-primary" />
            <h2 class="text-sm font-semibold">
              SLA risk
            </h2>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div class="text-xs text-muted">
                Tracked
              </div>
              <div class="text-lg font-semibold tabular-nums">
                {{ formatNumber(a.slaTracked) }}
              </div>
            </div>
            <div>
              <div class="text-xs text-muted">
                Within SLA
              </div>
              <div class="text-lg font-semibold tabular-nums">
                {{ pctLabel(a.withinSlaPct) }}
              </div>
            </div>
            <div>
              <div class="text-xs text-muted">
                Due soon
              </div>
              <div class="text-lg font-semibold tabular-nums">
                {{ formatNumber(a.dueSoon) }}
              </div>
            </div>
            <div>
              <div class="text-xs text-muted">
                Overdue open
              </div>
              <div class="text-lg font-semibold tabular-nums">
                {{ formatNumber(a.overdueOpen) }}
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-default bg-default p-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-message-square-reply" class="size-4 text-primary" />
            <h2 class="text-sm font-semibold">
              Response coverage
            </h2>
          </div>
          <div class="mt-4 space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Responded</span>
              <span class="font-medium tabular-nums">{{ formatNumber(a.responded) }} / {{ formatNumber(a.total) }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded bg-elevated">
              <div class="h-full bg-primary" :style="{ width: `${a.responseRatePct}%` }" />
            </div>
            <div class="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div class="text-xs text-muted">
                  Closed
                </div>
                <div class="text-lg font-semibold tabular-nums">
                  {{ formatNumber(a.closed) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-muted">
                  Open
                </div>
                <div class="text-lg font-semibold tabular-nums">
                  {{ formatNumber(a.open) }}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        <section class="rounded-lg border border-default bg-default p-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-list-filter" class="size-4 text-primary" />
            <h2 class="text-sm font-semibold">
              By channel
            </h2>
          </div>
          <div v-if="channelRows.length" class="mt-4 space-y-3">
            <div v-for="row in channelRows" :key="row.key" class="space-y-1.5">
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="font-medium">{{ row.label }}</span>
                <span class="text-muted tabular-nums">{{ formatNumber(row.total) }} · {{ row.conversionRatePct }}% converted</span>
              </div>
              <div class="h-2 overflow-hidden rounded bg-elevated">
                <div class="h-full bg-primary/70" :style="{ width: barWidth(row.total, maxChannelTotal) }" />
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{{ formatNumber(row.open) }} open</span>
                <span>{{ formatNumber(row.breaches) }} breaches</span>
                <span>{{ pctLabel(row.withinSlaPct) }} within SLA</span>
              </div>
            </div>
          </div>
          <p v-else class="mt-4 text-sm text-muted">
            No channel data in this period.
          </p>
        </section>

        <section class="rounded-lg border border-default bg-default p-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-network" class="size-4 text-primary" />
            <h2 class="text-sm font-semibold">
              By platform
            </h2>
          </div>
          <div v-if="platformRows.length" class="mt-4 space-y-3">
            <div v-for="row in platformRows" :key="row.key" class="space-y-1.5">
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="font-medium">{{ row.label }}</span>
                <span class="text-muted tabular-nums">{{ formatNumber(row.total) }} · {{ row.avgFirstResponseMinutes }}m avg</span>
              </div>
              <div class="h-2 overflow-hidden rounded bg-elevated">
                <div class="h-full bg-primary/70" :style="{ width: barWidth(row.total, maxPlatformTotal) }" />
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{{ formatNumber(row.responded) }} responded</span>
                <span>{{ formatNumber(row.converted) }} converted</span>
                <span>{{ pctLabel(row.withinSlaPct) }} within SLA</span>
              </div>
            </div>
          </div>
          <p v-else class="mt-4 text-sm text-muted">
            No platform data in this period.
          </p>
        </section>
      </div>
    </div>
    <div v-else class="text-sm text-muted">
      Select a client to view inbox analytics.
    </div>
  </div>
</template>
