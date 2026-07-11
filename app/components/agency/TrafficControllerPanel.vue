<script setup lang="ts">
interface TrafficControllerResponse {
  runId: string | null
  mode: 'read_only'
  answer: string
  summary: {
    signalCount: number
    missingSignals: string[]
    highPriorityCount: number
  }
  findings: Array<{
    severity: string
    title: string
    detail: string
  }>
  recommendations: Array<{
    priority: string
    area: string
    title: string
    rationale: string
  }>
  audit: {
    toolCallCount: number
    runLoggingAvailable?: boolean
  }
}

const prompt = ref('Review spend, publishing, and finance signals and recommend the safest operational allocation priorities.')
const pending = ref(false)
const error = ref<string | null>(null)
const result = ref<TrafficControllerResponse | null>(null)
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

function priorityColor(priority: string) {
  if (priority === 'high') return 'warning'
  if (priority === 'medium') return 'info'
  return 'neutral'
}

async function runTrafficController() {
  const cleanPrompt = prompt.value.trim()
  if (!cleanPrompt || pending.value) return
  pending.value = true
  error.value = null
  try {
    result.value = await apiFetch<TrafficControllerResponse>('/api/agency/agents/traffic-controller/ask', {
      method: 'POST',
      body: {
        prompt: cleanPrompt,
        context: {},
      },
    })
  } catch (err: any) {
    result.value = null
    if (err?.statusCode === 404 || err?.data?.statusCode === 404) {
      error.value = 'Traffic Controller Agent is not enabled in this environment.'
    } else {
      error.value = err?.data?.statusMessage || err?.message || 'Traffic Controller could not complete the review.'
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
          <UIcon name="i-lucide-route" class="size-5 text-primary" />
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-semibold">Traffic Controller Agent</h2>
            <UBadge color="success" variant="soft" size="xs">Read only</UBadge>
            <UBadge v-if="result?.audit.runLoggingAvailable" color="neutral" variant="soft" size="xs">Run logged</UBadge>
          </div>
          <p class="mt-0.5 text-xs text-muted">Combines spend, publishing, and finance signals into allocation priorities.</p>
        </div>
      </div>
      <UButton
        size="sm"
        icon="i-lucide-radar"
        :loading="pending"
        :disabled="pending || !prompt.trim()"
        @click="runTrafficController"
      >
        Review traffic
      </UButton>
    </div>

    <div class="grid gap-4 p-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
      <UTextarea v-model="prompt" :rows="4" class="w-full" :disabled="pending" aria-label="Traffic Controller prompt" />
      <div class="min-h-[180px] rounded-md border border-default bg-default/20 p-4">
        <UAlert
          v-if="error"
          color="warning"
          variant="soft"
          title="Traffic Controller unavailable"
          :description="error"
        />
        <div v-else-if="pending" class="flex min-h-[140px] items-center justify-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          Reviewing platform signals...
        </div>
        <div v-else-if="!result" class="flex min-h-[140px] items-center justify-center text-center text-sm text-muted">
          Run a traffic review before reallocating work, budget, or publishing attention.
        </div>
        <div v-else class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="soft" size="xs">{{ result.mode.replace('_', ' ') }}</UBadge>
            <UBadge color="neutral" variant="soft" size="xs">{{ result.summary.signalCount }} signals</UBadge>
            <UBadge v-if="result.runId" color="neutral" variant="soft" size="xs">Run {{ result.runId }}</UBadge>
            <UBadge color="success" variant="soft" size="xs">0 direct writes</UBadge>
          </div>
          <p class="text-sm text-default">{{ result.answer }}</p>
          <div class="grid gap-2 text-xs sm:grid-cols-3">
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">Signals</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.signalCount }}</p>
            </div>
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">Missing</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.missingSignals.length }}</p>
            </div>
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">High priority</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.highPriorityCount }}</p>
            </div>
          </div>
          <div class="space-y-2">
            <div v-for="item in result.recommendations" :key="item.title" class="rounded-md border border-default p-3">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :color="priorityColor(item.priority)" variant="soft" size="xs">{{ item.priority }}</UBadge>
                <UBadge color="neutral" variant="soft" size="xs">{{ item.area }}</UBadge>
                <p class="text-sm font-medium">{{ item.title }}</p>
              </div>
              <p class="mt-1 text-xs text-muted">{{ item.rationale }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
