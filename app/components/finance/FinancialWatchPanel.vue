<script setup lang="ts">
interface FinancialWatchResponse {
  runId: string | null
  mode: 'read_only'
  answer: string
  summary: {
    latestReport: null | {
      periodLabel: string
      grade: string | null
      score: number | null
      headline: string | null
    }
    activeRecommendationCount: number
    highPriorityRecommendationCount: number
    activeBudgetAlertCount: number
    criticalBudgetAlertCount: number
  }
  findings: Array<{
    severity: string
    title: string
    detail: string
  }>
  alerts: Array<{
    source: string
    level: string
    message: string
  }>
  audit: {
    toolCallCount: number
    runLoggingAvailable?: boolean
  }
}

const prompt = ref('Review financial watch signals and tell me what needs attention before we make operational changes.')
const pending = ref(false)
const error = ref<string | null>(null)
const result = ref<FinancialWatchResponse | null>(null)
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

function toneColor(severity: string) {
  return severity === 'warning' || severity === 'critical' ? 'warning' : 'info'
}

async function runFinancialWatch() {
  const cleanPrompt = prompt.value.trim()
  if (!cleanPrompt || pending.value) return
  pending.value = true
  error.value = null
  try {
    result.value = await apiFetch<FinancialWatchResponse>('/api/agency/agents/financial-watch/ask', {
      method: 'POST',
      body: {
        prompt: cleanPrompt,
        context: {},
      },
    })
  } catch (err: any) {
    result.value = null
    if (err?.statusCode === 404 || err?.data?.statusCode === 404) {
      error.value = 'Financial Watch Agent is not enabled in this environment.'
    } else {
      error.value = err?.data?.statusMessage || err?.message || 'Financial Watch could not complete the review.'
    }
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="rounded-lg border border-default overflow-hidden">
    <div class="flex flex-col gap-3 border-b border-default bg-elevated/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div class="rounded-md bg-default p-2">
          <UIcon name="i-lucide-shield-alert" class="size-5 text-primary" />
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-semibold">Financial Watch Agent</h2>
            <UBadge color="success" variant="soft" size="xs">Read only</UBadge>
            <UBadge v-if="result?.audit.runLoggingAvailable" color="neutral" variant="soft" size="xs">Run logged</UBadge>
          </div>
          <p class="mt-0.5 text-xs text-muted">Reviews stored advisor reports, recommendations, and budget alerts.</p>
        </div>
      </div>
      <UButton
        size="sm"
        icon="i-lucide-radar"
        :loading="pending"
        :disabled="pending || !prompt.trim()"
        @click="runFinancialWatch"
      >
        Run watch
      </UButton>
    </div>

    <div class="grid gap-4 p-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
      <UTextarea v-model="prompt" :rows="3" class="w-full" :disabled="pending" aria-label="Financial Watch prompt" />
      <div class="min-h-[140px] rounded-md border border-default bg-default/20 p-4">
        <UAlert
          v-if="error"
          color="warning"
          variant="soft"
          title="Financial Watch unavailable"
          :description="error"
        />
        <div v-else-if="pending" class="flex min-h-[108px] items-center justify-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          Reviewing finance signals...
        </div>
        <div v-else-if="!result" class="flex min-h-[108px] items-center justify-center text-center text-sm text-muted">
          Run a watch review to surface open finance risks from stored advisor signals.
        </div>
        <div v-else class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="soft" size="xs">{{ result.mode.replace('_', ' ') }}</UBadge>
            <UBadge color="neutral" variant="soft" size="xs">{{ result.audit.toolCallCount }} reads</UBadge>
            <UBadge v-if="result.runId" color="neutral" variant="soft" size="xs">Run {{ result.runId }}</UBadge>
            <UBadge color="success" variant="soft" size="xs">0 direct writes</UBadge>
          </div>
          <p class="text-sm text-default">{{ result.answer }}</p>
          <div class="grid gap-2 text-xs sm:grid-cols-4">
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">Grade</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.latestReport?.grade || '-' }}</p>
            </div>
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">Open recs</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.activeRecommendationCount }}</p>
            </div>
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">High priority</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.highPriorityRecommendationCount }}</p>
            </div>
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">Budget alerts</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.activeBudgetAlertCount }}</p>
            </div>
          </div>
          <div v-if="result.findings.length" class="space-y-2">
            <div v-for="finding in result.findings" :key="finding.title" class="rounded-md border border-default p-3">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :color="toneColor(finding.severity)" variant="soft" size="xs">{{ finding.severity }}</UBadge>
                <p class="text-sm font-medium">{{ finding.title }}</p>
              </div>
              <p class="mt-1 text-xs text-muted">{{ finding.detail }}</p>
            </div>
          </div>
          <div v-if="result.alerts.length" class="rounded-md bg-elevated/40 p-3">
            <p class="text-xs font-medium uppercase text-muted">Watch alerts</p>
            <ul class="mt-2 space-y-1 text-xs text-default">
              <li v-for="alert in result.alerts" :key="`${alert.source}:${alert.message}`" class="flex gap-2">
                <UIcon name="i-lucide-alert-triangle" class="mt-0.5 size-3 shrink-0 text-warning" />
                <span>{{ alert.message }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
