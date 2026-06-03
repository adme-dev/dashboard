<script setup lang="ts">
import { useSocialReporting, type ReportKpi } from '~/composables/useSocialReporting'
import { SOCIAL_PLATFORM_FILTER_OPTIONS } from '~~/app/utils/socialReportScheduleForm'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })
useHead({ title: 'Social Reporting' })

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)
const clientName = computed(() => clients.value.find(c => c.id === clientId.value)?.name ?? 'this client')

const { overview, posts, ops, aiSummary, loading, days, platform, load, generateSummary } = useSocialReporting(clientId)

const dayOptions = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
]
const platformOptions = SOCIAL_PLATFORM_FILTER_OPTIONS
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const summarising = ref(false)
async function onSummarise() {
  summarising.value = true
  try { await generateSummary(clientName.value) } finally { summarising.value = false }
}

const showSchedules = ref(false)

const kpiCards = computed(() => {
  const k = overview.value?.kpis
  if (!k) return []
  return [
    { label: 'Posts', kpi: k.posts, fmt: (v: number) => String(v) },
    { label: 'Impressions', kpi: k.impressions, fmt: fmtNum },
    { label: 'Reach', kpi: k.reach, fmt: fmtNum },
    { label: 'Engagements', kpi: k.engagements, fmt: fmtNum },
    { label: 'Eng. rate', kpi: k.engagementRate, fmt: (v: number) => `${v}%` },
    { label: 'Link clicks', kpi: k.clicks, fmt: fmtNum },
  ]
})
function fmtNum(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }
function deltaColor(d: number | null) { return d == null ? 'neutral' : d > 0 ? 'success' : d < 0 ? 'error' : 'neutral' }
function deltaLabel(d: number | null) { return d == null ? '—' : `${d > 0 ? '+' : ''}${d}%` }

const maxCadence = computed(() => Math.max(1, ...(overview.value?.cadence ?? []).map(c => c.posts)))

watch(clientId, load)
watch([days, platform], load)
onMounted(load)
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center gap-3 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold">Reporting</h1>
        <p class="text-sm text-muted mt-0.5">Organic performance across your connected social accounts.</p>
      </div>
      <div class="flex items-center gap-2 ml-auto">
        <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Client" class="w-52" />
        <USelectMenu v-model="platform" :items="platformOptions" value-key="value" class="w-44" />
        <USelectMenu v-model="days" :items="dayOptions" value-key="value" class="w-36" />
        <UButton
          icon="i-lucide-calendar-clock"
          color="neutral"
          variant="subtle"
          label="Schedules"
          :disabled="!clientId"
          @click="showSchedules = true"
        />
      </div>
    </div>

    <SocialSuiteSectionNav />

    <SocialReportSchedulesManager v-model:open="showSchedules" :client-id="clientId" :client-name="clientName" />

    <div v-if="loading" class="text-sm text-muted">Loading…</div>
    <template v-else-if="overview">
      <!-- KPI cards -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div v-for="c in kpiCards" :key="c.label" class="rounded-lg border border-default bg-default p-4">
          <div class="text-xs text-muted">{{ c.label }}</div>
          <div class="text-2xl font-semibold mt-1">{{ c.fmt(c.kpi.value) }}</div>
          <UBadge :color="deltaColor(c.kpi.deltaPct) as any" variant="subtle" size="xs" class="mt-1">{{ deltaLabel(c.kpi.deltaPct) }}</UBadge>
        </div>
      </div>

      <!-- AI summary -->
      <UCard>
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-sparkles" class="text-primary mt-0.5 shrink-0" />
          <div class="flex-1 min-w-0">
            <p v-if="aiSummary" class="text-sm whitespace-pre-wrap">{{ aiSummary }}</p>
            <p v-else class="text-sm text-muted">Generate an AI summary of this period's performance.</p>
          </div>
          <UButton size="sm" variant="subtle" icon="i-lucide-wand-2" :loading="summarising" label="Summarise" @click="onSummarise" />
        </div>
      </UCard>

      <div class="grid lg:grid-cols-2 gap-6">
        <!-- Posting cadence -->
        <div class="rounded-lg border border-default bg-default p-4">
          <h2 class="text-sm font-semibold mb-3">Posting cadence</h2>
          <div class="space-y-1.5">
            <div v-for="c in overview.cadence" :key="c.weekday" class="flex items-center gap-2 text-xs">
              <span class="w-9 text-muted">{{ WEEKDAYS[c.weekday] }}</span>
              <div class="flex-1 h-4 bg-elevated rounded overflow-hidden">
                <div class="h-full bg-primary/70" :style="{ width: `${(c.posts / maxCadence) * 100}%` }" />
              </div>
              <span class="w-8 text-right tabular-nums">{{ c.posts }}</span>
              <span class="w-20 text-right text-muted">~{{ c.avgEngagements }} eng</span>
            </div>
          </div>
        </div>

        <!-- Engagement ops (from inbox) -->
        <div class="rounded-lg border border-default bg-default p-4">
          <h2 class="text-sm font-semibold mb-3">Engagement ops</h2>
          <div v-if="ops" class="grid grid-cols-2 gap-3 text-sm">
            <div><div class="text-xs text-muted">Conversations</div><div class="text-lg font-semibold">{{ ops.total }}</div></div>
            <div><div class="text-xs text-muted">Avg first response</div><div class="text-lg font-semibold">{{ ops.avgFirstResponseMinutes }}m</div></div>
            <div><div class="text-xs text-muted">Within SLA</div><div class="text-lg font-semibold">{{ ops.withinSlaPct ?? '—' }}<span v-if="ops.withinSlaPct != null">%</span></div></div>
            <div><div class="text-xs text-muted">Automation rate</div><div class="text-lg font-semibold">{{ ops.automationRatePct }}%</div></div>
          </div>
          <p v-else class="text-sm text-muted">No engagement data yet.</p>
        </div>
      </div>

      <!-- Best content -->
      <div class="rounded-lg border border-default bg-default p-4">
        <h2 class="text-sm font-semibold mb-3">Top content</h2>
        <div v-if="overview.bestContent.length" class="space-y-2">
          <div v-for="b in overview.bestContent" :key="b.postId" class="flex items-center gap-3 text-sm border-b border-default last:border-0 pb-2 last:pb-0">
            <p class="flex-1 min-w-0 truncate">{{ b.content || '(no caption)' }}</p>
            <span class="text-muted shrink-0 tabular-nums">{{ b.engagements }} eng</span>
            <UBadge color="primary" variant="subtle" size="xs">{{ b.engagementRate }}%</UBadge>
            <UButton v-if="b.permalink" :to="b.permalink" target="_blank" icon="i-lucide-external-link" variant="ghost" size="xs" />
          </div>
        </div>
        <p v-else class="text-sm text-muted">No published posts with metrics in this period.</p>
      </div>

      <p class="text-xs text-muted">{{ posts.length }} posts in range · metrics collected by the daily sync.</p>
    </template>
    <div v-else class="text-sm text-muted">Select a client to view reporting.</div>
  </div>
</template>
