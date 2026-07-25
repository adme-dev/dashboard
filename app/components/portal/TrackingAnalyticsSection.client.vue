<script setup lang="ts">
const props = defineProps<{ startDate: string; endDate: string }>()

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>

const q = computed(() => ({ from: props.startDate, to: props.endDate }))
const base = computed(() => '/api/portal/analytics/tracking')

type TimeseriesResponse = { points: { day: string, visitors: number, events: number }[] }
type FunnelResponse = { steps: { step: string, sessions: number, rate: number }[] }
type BreakdownResponse = { rows: { key: string, count: number }[] }
type BehaviorRow = {
  key: string
  visitors: number
  sessions: number
  pageViews: number
  events: number
  engagedSessions: number
  engagementRate: number
  avgEngagementSeconds: number
  scroll75Sessions: number
  vehicleViews: number
  phoneClicks: number
  formSubmits: number
  leadIntents: number
  confirmedLeads: number
  qualifiedLeads: number
  wonLeads: number
  confirmedLeadRate: number
}
type BehaviorInsightsResponse = {
  generatedAt: string
  authority: {
    behavior: string
    leadIntent: string
    confirmedOutcome: string
    externalLiveCalls: boolean
  }
  dimensions: {
    pages: BehaviorRow[]
    devices: BehaviorRow[]
    sources: BehaviorRow[]
  }
}
type SummaryResponse = {
  visitors: number
  sessions: number
  pageViews: number
  events: number
  avgEngagementSeconds: number
  sessionsScrolled75: number
  callClicks: number
  formSubmits: number
  generateLeads: number
  testDriveBookings: number
  interactionLeads: number
  vehicleViews: number
}
type LeadHealthResponse = {
  mode: 'analytics_only' | 'capture_only' | 'full_crm'
  status: 'inactive' | 'attention' | 'healthy'
  formSubmits: number
  confirmedLeads: number
  crmLinkedLeads: number
  campaignAttributedLeads: number
  browserLinkedLeads: number
  providerNativeLeads: number
  websiteConfirmedLeads: number
  unmatchedSubmissions: number
  promotionFailures: number
  promotionPending: number
  contactedLeads: number
  qualifiedLeads: number
  wonLeads: number
  lostLeads: number
  wonValue: number
  avgResponseMinutes: number | null
  attributionCoverage: number
  firstTouchCoverage: number
  lastTouchCoverage: number
  browserLinkCoverage: number | null
  crmCoverage: number | null
  issues: string[]
  unmatched: { eventId: string, occurredAt: string, pageUrl: string | null }[]
  failedPromotions: {
    leadId: string
    attempts: number
    outcome: string | null
    errorClass: string | null
    updatedAt: string
  }[]
}

const summary = ref<SummaryResponse | null>(null)
const ts = ref<TimeseriesResponse | null>(null)
const funnel = ref<FunnelResponse | null>(null)
const pages = ref<BreakdownResponse | null>(null)
const sources = ref<BreakdownResponse | null>(null)
const devices = ref<BreakdownResponse | null>(null)
const leadHealth = ref<LeadHealthResponse | null>(null)
const behaviorInsights = ref<BehaviorInsightsResponse | null>(null)
const summaryPending = ref(false)

async function refreshAll() {
  summaryPending.value = true
  try {
    const [nextSummary, nextTimeseries, nextFunnel, nextPages, nextSources, nextDevices, nextLeadHealth, nextBehaviorInsights] = await Promise.all([
      apiFetch<SummaryResponse>(`${base.value}/summary`, { query: q.value }),
      apiFetch<TimeseriesResponse>(`${base.value}/timeseries`, { query: q.value }),
      apiFetch<FunnelResponse>(`${base.value}/funnel`, { query: q.value }),
      apiFetch<BreakdownResponse>(`${base.value}/breakdown`, { query: { ...q.value, dimension: 'page' } }),
      apiFetch<BreakdownResponse>(`${base.value}/breakdown`, { query: { ...q.value, dimension: 'source' } }),
      apiFetch<BreakdownResponse>(`${base.value}/breakdown`, { query: { ...q.value, dimension: 'device' } }),
      apiFetch<LeadHealthResponse>(`${base.value}/health`, { query: q.value }),
      apiFetch<BehaviorInsightsResponse>(`${base.value}/insights`, { query: q.value })
    ])

    summary.value = nextSummary
    ts.value = nextTimeseries
    funnel.value = nextFunnel
    pages.value = nextPages
    sources.value = nextSources
    devices.value = nextDevices
    leadHealth.value = nextLeadHealth
    behaviorInsights.value = nextBehaviorInsights
  } catch {
    summary.value = null
    ts.value = null
    funnel.value = null
    pages.value = null
    sources.value = null
    devices.value = null
    leadHealth.value = null
    behaviorInsights.value = null
  } finally {
    summaryPending.value = false
  }
}

await refreshAll()
watch([() => props.startDate, () => props.endDate], () => {
  void refreshAll()
})
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-default">
        Website Analytics
      </h2>
      <UBadge color="neutral" variant="subtle">
        {{ props.startDate }} → {{ props.endDate }}
      </UBadge>
    </div>

    <TrackingAnalyticsKpis
      :data="summary"
      :pending="summaryPending"
    />

    <UCard v-if="leadHealth" :ui="{ body: 'space-y-4' }">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-default">
            Lead capture health
          </p>
          <p class="text-xs text-muted mt-1">
            Identified lead submissions, confirmed provider leads, attribution and CRM delivery.
          </p>
        </div>
        <UBadge
          :color="leadHealth.status === 'healthy' ? 'success' : leadHealth.status === 'attention' ? 'warning' : 'neutral'"
          variant="subtle"
        >
          {{ leadHealth.status === 'healthy' ? 'Healthy' : leadHealth.status === 'attention' ? 'Needs attention' : 'No activity' }}
        </UBadge>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="rounded-lg border border-default p-3">
          <p class="text-xs text-muted">Lead submit intents</p>
          <p class="text-xl font-semibold tabular-nums mt-1">{{ leadHealth.formSubmits }}</p>
        </div>
        <div class="rounded-lg border border-default p-3">
          <p class="text-xs text-muted">Confirmed leads</p>
          <p class="text-xl font-semibold tabular-nums mt-1">{{ leadHealth.confirmedLeads }}</p>
        </div>
        <div class="rounded-lg border border-default p-3">
          <p class="text-xs text-muted">CRM linked</p>
          <p class="text-xl font-semibold tabular-nums mt-1">{{ leadHealth.crmLinkedLeads }}</p>
        </div>
        <div class="rounded-lg border border-default p-3">
          <p class="text-xs text-muted">Campaign attributed</p>
          <p class="text-xl font-semibold tabular-nums mt-1">{{ leadHealth.campaignAttributedLeads }}</p>
        </div>
        <div class="rounded-lg border border-default p-3">
          <p class="text-xs text-muted">Browser linked</p>
          <p class="text-xl font-semibold tabular-nums mt-1">{{ leadHealth.browserLinkedLeads }}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="rounded-lg bg-elevated/50 p-3">
          <p class="text-xs text-muted">Provider-native leads</p>
          <p class="text-lg font-semibold tabular-nums mt-1">{{ leadHealth.providerNativeLeads }}</p>
          <p class="text-[11px] text-dimmed mt-1">Meta and Google in-platform forms</p>
        </div>
        <div class="rounded-lg bg-elevated/50 p-3">
          <p class="text-xs text-muted">Unmatched lead intents</p>
          <p class="text-lg font-semibold tabular-nums mt-1">{{ leadHealth.unmatchedSubmissions }}</p>
          <p class="text-[11px] text-dimmed mt-1">Older than 15 minutes</p>
        </div>
        <div class="rounded-lg bg-elevated/50 p-3">
          <p class="text-xs text-muted">Attribution coverage</p>
          <p class="text-lg font-semibold tabular-nums mt-1">{{ leadHealth.attributionCoverage }}%</p>
          <p class="text-[11px] text-dimmed mt-1">
            First {{ leadHealth.firstTouchCoverage }}% · Last {{ leadHealth.lastTouchCoverage }}%
          </p>
        </div>
        <div class="rounded-lg bg-elevated/50 p-3">
          <p class="text-xs text-muted">CRM promotion queue</p>
          <p class="text-lg font-semibold tabular-nums mt-1">
            {{ leadHealth.promotionPending }} pending
          </p>
          <p class="text-[11px] text-dimmed mt-1">{{ leadHealth.promotionFailures }} failed</p>
        </div>
      </div>

      <div class="border-t border-default pt-4">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <p class="text-sm font-medium text-default">CRM lifecycle feedback</p>
            <p class="text-xs text-muted mt-1">Confirmed lead outcomes returned to campaign reporting.</p>
          </div>
          <div class="text-right">
            <p class="text-xs text-muted">Won opportunity value</p>
            <p class="text-lg font-semibold tabular-nums">
              {{ new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(leadHealth.wonValue) }}
            </p>
          </div>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">Contacted</p>
            <p class="text-lg font-semibold tabular-nums mt-1">{{ leadHealth.contactedLeads }}</p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">Qualified</p>
            <p class="text-lg font-semibold tabular-nums mt-1">{{ leadHealth.qualifiedLeads }}</p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">Won</p>
            <p class="text-lg font-semibold tabular-nums mt-1">{{ leadHealth.wonLeads }}</p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">Lost</p>
            <p class="text-lg font-semibold tabular-nums mt-1">{{ leadHealth.lostLeads }}</p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">Average response</p>
            <p class="text-lg font-semibold tabular-nums mt-1">
              {{ leadHealth.avgResponseMinutes == null ? '—' : `${Math.round(leadHealth.avgResponseMinutes)}m` }}
            </p>
          </div>
        </div>
      </div>

      <div v-if="leadHealth.issues.length" class="space-y-2">
        <div
          v-for="issue in leadHealth.issues"
          :key="issue"
          class="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          <UIcon name="i-lucide-triangle-alert" class="size-4 mt-0.5 shrink-0" />
          <span>{{ issue }}</span>
        </div>
      </div>

      <div
        v-if="leadHealth.unmatched.length || leadHealth.failedPromotions.length"
        class="grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-default pt-4"
      >
        <div v-if="leadHealth.unmatched.length">
          <p class="text-xs font-medium text-default mb-2">Recent unmatched lead intents</p>
          <div class="space-y-2">
            <div
              v-for="item in leadHealth.unmatched"
              :key="item.eventId"
              class="rounded-lg bg-elevated/50 px-3 py-2"
            >
              <p class="text-xs font-medium truncate">{{ item.pageUrl || 'Unknown page' }}</p>
              <p class="text-[11px] text-muted mt-1">{{ new Date(item.occurredAt).toLocaleString('en-AU') }}</p>
            </div>
          </div>
        </div>
        <div v-if="leadHealth.failedPromotions.length">
          <p class="text-xs font-medium text-default mb-2">CRM promotion failures</p>
          <div class="space-y-2">
            <div
              v-for="item in leadHealth.failedPromotions"
              :key="item.leadId"
              class="rounded-lg bg-error/10 px-3 py-2"
            >
              <p class="text-xs font-medium text-error">{{ item.outcome || item.errorClass || 'Promotion failed' }}</p>
              <p class="text-[11px] text-muted mt-1">{{ item.attempts }} attempt(s) · {{ new Date(item.updatedAt).toLocaleString('en-AU') }}</p>
            </div>
          </div>
        </div>
      </div>
    </UCard>


    <TrackingAnalyticsTrafficChart
      :points="ts?.points ?? []"
    />

    <TrackingAnalyticsIntent
      :call-clicks="summary?.callClicks ?? 0"
      :form-submits="summary?.formSubmits ?? 0"
      :generate-leads="summary?.generateLeads ?? 0"
      :test-drive-bookings="summary?.testDriveBookings ?? 0"
      :interaction-leads="summary?.interactionLeads ?? 0"
      :vehicle-views="summary?.vehicleViews ?? 0"
    />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <TrackingAnalyticsBreakdownTable title="Top pages" :rows="pages?.rows ?? []" />
      <TrackingAnalyticsBreakdownTable title="Top sources" :rows="sources?.rows ?? []" />
      <TrackingAnalyticsBreakdownTable title="Devices" :rows="devices?.rows ?? []" />
    </div>

    <PortalTrackingBehaviorExplorer
      :data="behaviorInsights"
      :pending="summaryPending"
    />

    <TrackingAnalyticsFunnel
      :steps="funnel?.steps ?? []"
    />
  </section>
</template>
