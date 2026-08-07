<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  AudienceAskResponse,
  AudienceBreakdownDimension,
  AudienceKpis
} from '~/types/audience-analytics'
import { formatAudienceMetric } from '~/utils/audienceAnalytics'

const props = defineProps<{
  from: string
  to: string
  clientId: string | null
}>()

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const BRIEFING_QUESTION = 'Brief the marketing team on this audience window.'
const examples = [
  'Which audience pattern deserves attention first?',
  'Where is audience quality strongest by source?',
  'What tracking gaps weaken this analysis?'
]

const question = ref('')
const lastQuestion = ref(BRIEFING_QUESTION)
const answer = ref<AudienceAskResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const showEvidence = ref(false)

const questionError = computed(() => (
  question.value.length > 500 ? 'Question must be 500 characters or fewer' : undefined
))
const canAsk = computed(() => question.value.trim().length > 0 && !questionError.value && !loading.value)
const scopeLabel = computed(() => answer.value?.grounding.scope === 'client' ? 'Client scope' : 'Agency scope')

const kpiLabels: Record<keyof AudienceKpis, string> = {
  visitors: 'Visitors',
  sessions: 'Sessions',
  pageViews: 'Page views',
  engagedSessions: 'Engaged sessions',
  engagementRate: 'Engagement rate',
  repeatVisitors: 'Repeat visitors',
  leadActions: 'Lead actions',
  confirmedLeads: 'Confirmed leads',
  visitorToLeadRate: 'Visitor to lead rate',
  attributionCoverage: 'Attribution coverage'
}

const kpiRows = computed(() => {
  if (!answer.value) return []
  return (Object.keys(kpiLabels) as Array<keyof AudienceKpis>).map(metric => ({
    metric: kpiLabels[metric],
    current: formatAudienceMetric(metric, answer.value!.grounding.kpis[metric]),
    previous: formatAudienceMetric(metric, answer.value!.grounding.previousKpis[metric])
  }))
})

const opportunityRows = computed(() => answer.value?.grounding.opportunities.map(opportunity => ({
  opportunity: opportunity.title,
  status: opportunity.status === 'opportunity' ? 'Opportunity' : 'Building evidence',
  audience: opportunity.count.toLocaleString('en-AU')
})) ?? [])

const breakdownRows = computed(() => {
  if (!answer.value) return []
  return Object.entries(answer.value.grounding.breakdowns).flatMap(([dimension, rows]) => (
    (rows ?? []).slice(0, 5).map(row => ({
      dimension: dimensionLabel(dimension as AudienceBreakdownDimension),
      segment: row.key,
      visitors: row.visitors.toLocaleString('en-AU'),
      engagement: `${row.engagementRate.toLocaleString('en-AU', { maximumFractionDigits: 1 })}%`,
      confirmedLeads: row.confirmedLeads.toLocaleString('en-AU')
    }))
  ))
})

const kpiColumns = [
  { accessorKey: 'metric', header: 'Metric' },
  { accessorKey: 'current', header: 'Current' },
  { accessorKey: 'previous', header: 'Previous' }
]
const opportunityColumns = [
  { accessorKey: 'opportunity', header: 'Rule' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'audience', header: 'Audience' }
]
const breakdownColumns = [
  { accessorKey: 'dimension', header: 'Dimension' },
  { accessorKey: 'segment', header: 'Segment' },
  { accessorKey: 'visitors', header: 'Visitors' },
  { accessorKey: 'engagement', header: 'Engagement' },
  { accessorKey: 'confirmedLeads', header: 'Confirmed' }
]

function dimensionLabel(value: AudienceBreakdownDimension): string {
  const labels: Record<AudienceBreakdownDimension, string> = {
    source: 'Source',
    campaign: 'Campaign',
    page: 'Page',
    paid_organic: 'Paid / organic',
    device: 'Device',
    interest: 'Interest'
  }
  return labels[value]
}

function useExample(value: string) {
  question.value = value
  error.value = null
}

async function ask(value = question.value) {
  const prompt = value.trim()
  if (!prompt || prompt.length > 500 || loading.value) return

  lastQuestion.value = prompt
  loading.value = true
  error.value = null
  showEvidence.value = false

  try {
    answer.value = await apiFetch<AudienceAskResponse>('/api/agency/tracking/audiences/ask', {
      method: 'POST',
      body: {
        question: prompt,
        from: props.from,
        to: props.to,
        clientId: props.clientId ?? undefined
      }
    })
  } catch {
    answer.value = null
    error.value = 'The audience analyst is temporarily unavailable. The verified dashboard evidence above is unchanged.'
  } finally {
    loading.value = false
  }
}

function generateBriefing() {
  question.value = BRIEFING_QUESTION
  void ask(BRIEFING_QUESTION)
}

function toggleEvidence() {
  showEvidence.value = !showEvidence.value
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex items-start gap-3">
          <div class="rounded-lg bg-primary/10 p-2 text-primary">
            <UIcon name="i-lucide-sparkles" class="size-4" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              Audience analyst
            </h2>
            <p class="mt-1 max-w-2xl text-xs leading-5 text-muted">
              Ask for a concise reading of the aggregate evidence. Recommendations remain read-only and cite the active reporting window.
            </p>
          </div>
        </div>
        <UButton
          label="Generate audience briefing"
          icon="i-lucide-file-chart-column"
          color="primary"
          variant="soft"
          :loading="loading"
          @click="generateBriefing"
        />
      </div>
    </template>

    <div class="space-y-3">
      <UFormField
        label="Question"
        :error="questionError"
        :help="`${question.length}/500 characters`"
      >
        <UTextarea
          v-model="question"
          :disabled="loading"
          :rows="3"
          placeholder="Ask what changed, where quality is strongest, or what evidence is missing…"
          class="w-full"
          @keydown.ctrl.enter="ask()"
          @keydown.meta.enter="ask()"
        />
      </UFormField>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-1.5" aria-label="Example audience questions">
          <UButton
            v-for="example in examples"
            :key="example"
            :label="example"
            size="xs"
            color="neutral"
            variant="soft"
            @click="useExample(example)"
          />
        </div>
        <UButton
          label="Ask analyst"
          icon="i-lucide-arrow-right"
          trailing
          :loading="loading"
          :disabled="!canAsk"
          @click="ask()"
        />
      </div>
    </div>

    <UAlert
      v-if="error"
      class="mt-4"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="AI briefing unavailable"
      :description="error"
    >
      <template #actions>
        <UButton
          label="Retry"
          color="warning"
          variant="soft"
          size="sm"
          :loading="loading"
          @click="ask(lastQuestion)"
        />
      </template>
    </UAlert>

    <div v-else-if="answer" class="mt-5 rounded-xl border border-default bg-elevated/40 p-4 sm:p-5">
      <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
        <UBadge color="primary" variant="soft">
          {{ scopeLabel }}
        </UBadge>
        <span>{{ answer.grounding.window.fromDate }} to {{ answer.grounding.window.toDate }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ answer.grounding.window.days }} days</span>
      </div>

      <p class="mt-4 whitespace-pre-line text-sm leading-6 text-default">
        {{ answer.answer }}
      </p>

      <UButton
        :label="showEvidence ? 'Hide supporting evidence' : 'Show supporting evidence'"
        :icon="showEvidence ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        color="neutral"
        variant="link"
        size="sm"
        class="mt-3 px-0"
        @click="toggleEvidence"
      />

      <div v-if="showEvidence" class="mt-3 space-y-4 border-t border-default pt-4">
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
            KPI evidence
          </h3>
          <UTable :data="kpiRows" :columns="kpiColumns" class="mt-2" />
        </div>
        <div v-if="opportunityRows.length">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
            Opportunity evidence
          </h3>
          <UTable :data="opportunityRows" :columns="opportunityColumns" class="mt-2" />
        </div>
        <div v-if="breakdownRows.length">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
            Ranked breakdown evidence
          </h3>
          <UTable :data="breakdownRows" :columns="breakdownColumns" class="mt-2" />
        </div>
        <p class="text-xs text-muted">
          Supporting evidence contains aggregate metrics only. The analyst cannot activate audiences or change campaigns.
        </p>
      </div>
    </div>
  </UCard>
</template>
