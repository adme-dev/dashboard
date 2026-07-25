<script setup lang="ts">
interface PersonaMetricValues {
  totalPersonas: number
  returningPersonas: number
  confirmedLeads: number
  websiteMatchedLeads: number
  crmLinkedPersonas: number
  productIntentPersonas: number
  attributedLeads: number
  conflictPersonas: number
  returningRate: number
  websiteMatchRate: number
  crmMatchRate: number
  attributionCoverage: number
}

interface PersonaMetricsResponse {
  enabled: boolean
  generatedAt: string
  metrics: PersonaMetricValues | null
  sourceMix: Array<{ source: string, count: number }>
  lifecycleMix: Array<{ stage: string, count: number }>
  providerFeedback?: { pending: number, published: number, failed: number }
}

const props = defineProps<{
  startDate?: string
  endDate?: string
  platform?: string
  campaignId?: string | null
  adGroupId?: string
  adSetId?: string
  adId?: string
  creativeId?: string
  landingPage?: string
  device?: string
  clientId?: string | null
  apiBase?: string
  spend?: number
}>()

const route = useRoute()
const query = computed(() => ({
  ...(props.startDate ? { startDate: props.startDate } : {}),
  ...(props.endDate ? { endDate: props.endDate } : {}),
  ...(props.platform ? { platform: props.platform } : {}),
  ...(props.campaignId ? { campaignId: props.campaignId } : {}),
  ...(props.adGroupId ? { adGroupId: props.adGroupId } : {}),
  ...(props.adSetId ? { adSetId: props.adSetId } : {}),
  ...(props.adId ? { adId: props.adId } : {}),
  ...(props.creativeId ? { creativeId: props.creativeId } : {}),
  ...(props.landingPage ? { landingPage: props.landingPage } : {}),
  ...(props.device ? { device: props.device } : {}),
  ...(props.clientId ? { clientId: props.clientId } : {})
}))
const endpoint = computed(() => `${props.apiBase ?? '/api/portal/analytics'}/personas`)
const requestKey = [
  'persona-insights',
  route.path,
  props.clientId,
  props.platform,
  props.campaignId
].filter(Boolean).join(':')
const { data, status, error, refresh } = useFetch<PersonaMetricsResponse>(
  endpoint,
  {
    key: requestKey,
    query
  }
)

const metrics = computed(() => data.value?.metrics)
const cards = computed(() => {
  const value = metrics.value
  if (!value) return []
  return [
    {
      label: 'Known personas',
      value: value.totalPersonas.toLocaleString('en-AU'),
      detail: 'Deterministically resolved',
      icon: 'i-lucide-users-round'
    },
    {
      label: 'Returning personas',
      value: value.returningPersonas.toLocaleString('en-AU'),
      detail: `${value.returningRate}% of known personas`,
      icon: 'i-lucide-repeat-2'
    },
    {
      label: 'Confirmed leads',
      value: value.confirmedLeads.toLocaleString('en-AU'),
      detail: `${value.websiteMatchRate}% website matched`,
      icon: 'i-lucide-user-round-check'
    },
    {
      label: 'Attribution coverage',
      value: `${value.attributionCoverage}%`,
      detail: `${value.attributedLeads.toLocaleString('en-AU')} attributed leads`,
      icon: 'i-lucide-waypoints'
    }
  ]
})

const maxSourceCount = computed(() => Math.max(
  1,
  ...(data.value?.sourceMix.map(item => item.count) ?? [])
))
const costPerPersona = computed(() => {
  const total = metrics.value?.totalPersonas ?? 0
  return props.spend != null && total > 0 ? props.spend / total : null
})

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function updatedLabel(value: string | undefined): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

let refreshTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refresh()
  }, 300_000)
})
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <UCard
    v-if="data?.enabled || status === 'pending' || error"
    aria-live="polite"
  >
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-default">
              Persona audience signals
            </h2>
            <UBadge color="warning" variant="subtle">
              Pilot
            </UBadge>
          </div>
          <p class="mt-1 text-xs text-muted">
            Privacy-safe aggregates from website, lead, attribution, product and CRM identity evidence.
            <span v-if="campaignId">Filtered to this campaign.</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="data?.generatedAt" class="hidden text-xs text-muted sm:inline">
            Updated {{ updatedLabel(data.generatedAt) }}
          </span>
          <UButton
            to="/portal/crm?tab=personas"
            icon="i-lucide-arrow-up-right"
            size="xs"
            color="neutral"
            variant="outline"
          >
            View personas
          </UButton>
        </div>
      </div>
    </template>

    <div v-if="status === 'pending' && !data" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <USkeleton v-for="index in 4" :key="index" class="h-24 rounded-lg" />
    </div>

    <UAlert
      v-else-if="error"
      color="neutral"
      icon="i-lucide-circle-alert"
      title="Persona signals are temporarily unavailable"
      description="The rest of this dashboard is unaffected."
    />

    <div v-else-if="metrics" class="space-y-5">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          v-for="card in cards"
          :key="card.label"
          class="rounded-lg border border-default bg-elevated/25 p-3"
        >
          <div class="flex items-center gap-2 text-xs text-muted">
            <UIcon :name="card.icon" class="size-4" />
            <span>{{ card.label }}</span>
          </div>
          <p class="mt-2 text-xl font-semibold tabular-nums text-default">
            {{ card.value }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ card.detail }}
          </p>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <div>
          <h3 class="text-xs font-medium uppercase tracking-wide text-muted">
            Lead source mix
          </h3>
          <div v-if="data?.sourceMix.length" class="mt-3 space-y-2">
            <div v-for="source in data.sourceMix" :key="source.source">
              <div class="flex items-center justify-between text-xs">
                <span>{{ titleCase(source.source) }}</span>
                <span class="tabular-nums text-muted">{{ source.count }}</span>
              </div>
              <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${Math.max(4, (source.count / maxSourceCount) * 100)}%` }"
                />
              </div>
            </div>
          </div>
          <p v-else class="mt-3 text-sm text-muted">
            Source signals will appear as attributed leads are resolved.
          </p>
        </div>

        <dl class="grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-lg border border-default p-3">
            <dt class="text-xs text-muted">CRM matched</dt>
            <dd class="mt-1 font-semibold tabular-nums">{{ metrics.crmMatchRate }}%</dd>
          </div>
          <div class="rounded-lg border border-default p-3">
            <dt class="text-xs text-muted">Product intent</dt>
            <dd class="mt-1 font-semibold tabular-nums">{{ metrics.productIntentPersonas }}</dd>
          </div>
          <div class="rounded-lg border border-default p-3">
            <dt class="text-xs text-muted">Website matches</dt>
            <dd class="mt-1 font-semibold tabular-nums">{{ metrics.websiteMatchedLeads }}</dd>
          </div>
          <div class="rounded-lg border border-default p-3">
            <dt class="text-xs text-muted">Identity conflicts</dt>
            <dd
              class="mt-1 font-semibold tabular-nums"
              :class="metrics.conflictPersonas > 0 ? 'text-warning' : ''"
            >
              {{ metrics.conflictPersonas }}
            </dd>
          </div>
        </dl>
      </div>

      <div v-if="data?.lifecycleMix.length" class="flex flex-wrap items-center gap-2 border-t border-default pt-4">
        <span class="text-xs font-medium text-muted">CRM lifecycle</span>
        <UBadge
          v-for="stage in data.lifecycleMix"
          :key="stage.stage"
          color="neutral"
          variant="subtle"
        >
          {{ titleCase(stage.stage) }} {{ stage.count }}
        </UBadge>
        <UBadge v-if="costPerPersona != null" color="primary" variant="subtle">
          ${{ costPerPersona.toLocaleString('en-AU', { maximumFractionDigits: 2 }) }} per known persona
        </UBadge>
        <UBadge v-if="data?.providerFeedback?.published" color="success" variant="subtle">
          {{ data.providerFeedback.published }} lifecycle event{{ data.providerFeedback.published === 1 ? '' : 's' }} published
        </UBadge>
        <UBadge v-if="data?.providerFeedback?.pending" color="warning" variant="subtle">
          {{ data.providerFeedback.pending }} feedback event{{ data.providerFeedback.pending === 1 ? '' : 's' }} pending
        </UBadge>
      </div>
    </div>
  </UCard>
</template>
