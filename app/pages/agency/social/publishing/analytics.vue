<script setup lang="ts">
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'
import { useSocialReporting, type ReportKpi } from '~/composables/useSocialReporting'
import { SOCIAL_PLATFORM_FILTER_OPTIONS } from '~~/app/utils/socialReportScheduleForm'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { clientId } = useSocialPublishingClient()
const {
  overview,
  posts,
  aiSummary,
  loading,
  days,
  platform,
  load: loadReporting,
  generateSummary,
} = useSocialReporting(clientId)

interface WorkflowOverview {
  counts: { published: number; scheduled: number; failed: number; drafts: number }
  metrics: { impressions: number; engagements: number; clicks: number }
}

const workflow = ref<WorkflowOverview | null>(null)
const workflowLoading = ref(false)
const summarising = ref(false)

const dayOptions = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
]
const platformOptions = SOCIAL_PLATFORM_FILTER_OPTIONS
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

async function loadWorkflow() {
  if (!clientId.value) {
    workflow.value = null
    return
  }
  workflowLoading.value = true
  try {
    workflow.value = await $fetch<WorkflowOverview>('/api/agency/social/publishing/analytics/overview', {
      query: { clientId: clientId.value },
    })
  } finally {
    workflowLoading.value = false
  }
}

async function reload() {
  await Promise.all([loadWorkflow(), loadReporting()])
}

async function onSummarise() {
  if (!overview.value) return
  summarising.value = true
  try {
    await generateSummary('this client')
  } finally {
    summarising.value = false
  }
}

watch(clientId, reload, { immediate: true })
watch([days, platform], loadReporting)

const workflowCards = computed(() => {
  const counts = workflow.value?.counts
  return [
    { label: 'Published', value: counts?.published ?? 0, icon: 'i-lucide-check-circle-2', color: 'success' },
    { label: 'Scheduled', value: counts?.scheduled ?? 0, icon: 'i-lucide-calendar-clock', color: 'primary' },
    { label: 'Drafts', value: counts?.drafts ?? 0, icon: 'i-lucide-file-text', color: 'neutral' },
    { label: 'Failed', value: counts?.failed ?? 0, icon: 'i-lucide-alert-triangle', color: 'error' },
  ]
})

const kpiCards = computed(() => {
  const k = overview.value?.kpis
  if (!k) return []
  return [
    { label: 'Posts', kpi: k.posts, icon: 'i-lucide-send', format: fmtNum },
    { label: 'Impressions', kpi: k.impressions, icon: 'i-lucide-eye', format: fmtNum },
    { label: 'Reach', kpi: k.reach, icon: 'i-lucide-users', format: fmtNum },
    { label: 'Engagements', kpi: k.engagements, icon: 'i-lucide-heart', format: fmtNum },
    { label: 'Eng. rate', kpi: k.engagementRate, icon: 'i-lucide-activity', format: (value: number) => `${value}%` },
    { label: 'Link clicks', kpi: k.clicks, icon: 'i-lucide-mouse-pointer-click', format: fmtNum },
  ]
})

const maxCadence = computed(() => Math.max(1, ...(overview.value?.cadence ?? []).map(item => item.posts)))
const latestGrowth = computed(() => [...(overview.value?.accountGrowth ?? [])].slice(-6).reverse())
const isLoading = computed(() => loading.value || workflowLoading.value)

function fmtNum(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toLocaleString()
}

function deltaColor(delta: number | null) {
  if (delta == null || delta === 0) return 'neutral'
  return delta > 0 ? 'success' : 'error'
}

function deltaLabel(delta: number | null) {
  if (delta == null) return 'No baseline'
  return `${delta > 0 ? '+' : ''}${delta}%`
}

function kpiValue(kpi: ReportKpi, format: (value: number) => string) {
  return format(kpi.value)
}
</script>

<template>
  <SocialPublishingShell
    title="Publishing Analytics"
    subtitle="Organic publishing performance, workflow health, and top content for the selected client."
  >
    <template #actions>
      <USelectMenu
        v-model="platform"
        :items="platformOptions"
        value-key="value"
        label-key="label"
        class="w-44"
      />
      <USelectMenu
        v-model="days"
        :items="dayOptions"
        value-key="value"
        label-key="label"
        class="w-36"
      />
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="isLoading" @click="reload" />
    </template>

    <div v-if="!clientId" class="rounded-lg border border-default p-10 text-center text-sm text-muted">
      Select a client to view publishing analytics.
    </div>

    <template v-else>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="card in workflowCards" :key="card.label" class="rounded-lg border border-default p-4 bg-default">
          <div class="flex items-center gap-2 text-xs text-muted uppercase tracking-wide">
            <UIcon :name="card.icon" class="size-4" />
            {{ card.label }}
          </div>
          <div class="mt-2 text-2xl font-semibold tabular-nums">{{ card.value.toLocaleString() }}</div>
          <UBadge :color="card.color as any" variant="subtle" size="xs" class="mt-2">Workflow</UBadge>
        </div>
      </div>

      <div v-if="isLoading" class="mt-4 text-sm text-muted">Loading analytics...</div>

      <template v-else-if="overview">
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-6">
          <div v-for="card in kpiCards" :key="card.label" class="rounded-lg border border-default p-4 bg-default">
            <div class="flex items-center gap-2 text-xs text-muted uppercase tracking-wide">
              <UIcon :name="card.icon" class="size-4" />
              {{ card.label }}
            </div>
            <div class="mt-2 text-2xl font-semibold tabular-nums">{{ kpiValue(card.kpi, card.format) }}</div>
            <UBadge :color="deltaColor(card.kpi.deltaPct) as any" variant="subtle" size="xs" class="mt-2">
              {{ deltaLabel(card.kpi.deltaPct) }}
            </UBadge>
          </div>
        </div>

        <section class="rounded-lg border border-default p-4 bg-default mt-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 text-sm font-semibold">
                <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
                AI performance summary
              </div>
              <p v-if="aiSummary" class="mt-3 text-sm whitespace-pre-wrap">{{ aiSummary }}</p>
              <p v-else class="mt-3 text-sm text-muted">
                Generate a concise readout of publishing performance for this period.
              </p>
            </div>
            <UButton
              size="sm"
              variant="subtle"
              icon="i-lucide-wand-2"
              :loading="summarising"
              :disabled="!overview"
              @click="onSummarise"
            >
              Summarise
            </UButton>
          </div>
        </section>

        <div class="grid xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] gap-6 mt-6">
          <section class="rounded-lg border border-default p-4 bg-default">
            <div class="flex items-center justify-between gap-3 mb-4">
              <h2 class="text-sm font-semibold">Top content</h2>
              <UBadge color="neutral" variant="subtle" size="xs">{{ posts.length }} posts in range</UBadge>
            </div>
            <div v-if="overview.bestContent.length" class="divide-y divide-default">
              <div v-for="post in overview.bestContent" :key="post.postId" class="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm truncate">{{ post.content || '(no caption)' }}</p>
                  <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{{ fmtNum(post.engagements) }} engagements</span>
                    <span>{{ fmtNum(post.reach) }} reach</span>
                  </div>
                </div>
                <UBadge color="primary" variant="subtle" size="sm">{{ post.engagementRate }}%</UBadge>
                <UButton v-if="post.permalink" :to="post.permalink" target="_blank" icon="i-lucide-external-link" color="neutral" variant="ghost" size="xs" />
              </div>
            </div>
            <p v-else class="text-sm text-muted">No published posts with metrics in this period.</p>
          </section>

          <section class="rounded-lg border border-default p-4 bg-default">
            <h2 class="text-sm font-semibold mb-4">Posting cadence</h2>
            <div class="space-y-2">
              <div v-for="item in overview.cadence" :key="item.weekday" class="grid grid-cols-[36px_minmax(0,1fr)_72px] items-center gap-2 text-xs">
                <span class="text-muted">{{ weekdays[item.weekday] }}</span>
                <div class="h-4 rounded bg-elevated overflow-hidden">
                  <div class="h-full bg-primary/70" :style="{ width: `${(item.posts / maxCadence) * 100}%` }" />
                </div>
                <span class="text-right tabular-nums text-muted">{{ item.posts }} posts</span>
              </div>
            </div>
          </section>
        </div>

        <section class="rounded-lg border border-default p-4 bg-default mt-6">
          <h2 class="text-sm font-semibold mb-4">Account growth</h2>
          <div v-if="latestGrowth.length" class="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div v-for="row in latestGrowth" :key="`${row.platform}-${row.snapshot_date}`" class="rounded-md border border-default p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium capitalize">{{ row.platform }}</span>
                <span class="text-xs text-muted">{{ row.snapshot_date }}</span>
              </div>
              <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div class="text-muted">Followers</div>
                  <div class="font-semibold tabular-nums">{{ fmtNum(row.followers || 0) }}</div>
                </div>
                <div>
                  <div class="text-muted">Reach</div>
                  <div class="font-semibold tabular-nums">{{ fmtNum(row.reach || 0) }}</div>
                </div>
                <div>
                  <div class="text-muted">Impr.</div>
                  <div class="font-semibold tabular-nums">{{ fmtNum(row.impressions || 0) }}</div>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-muted">No account metric snapshots in this period.</p>
        </section>
      </template>

      <div v-else class="mt-4 rounded-lg border border-default p-10 text-center text-sm text-muted">
        No publishing performance data yet.
      </div>
    </template>
  </SocialPublishingShell>
</template>
