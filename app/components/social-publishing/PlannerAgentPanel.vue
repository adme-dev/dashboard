<script setup lang="ts">
interface PlannerFinding {
  severity: 'warning' | 'info'
  title: string
  detail: string
}

interface PlannerAgentResponse {
  runId: string | null
  mode: 'read_only'
  answer: string
  summary: {
    clientId: string
    postsByStatus: Record<string, number>
    campaignsByStatus: Record<string, number>
    connectedPlatforms: Record<string, number>
    queueCount: number
    totalSlots: number
    enabledSlots: number
    activeAccounts: number
    erroredAccounts: number
    nextScheduled: Array<{
      id: string
      status: string
      scheduledAt: string | null
      platforms: string[]
      contentPreview: string
    }>
  }
  findings: PlannerFinding[]
  recommendedActions: string[]
  proposedActions: []
  audit: {
    modelFeatureKey: string
    toolCallCount: number
    blockedActionCount: number
    runLoggingAvailable?: boolean
  }
}

const props = defineProps<{
  clientId: string
  disabled?: boolean
}>()

const prompt = ref('Review this client publishing planner and tell me what needs attention.')
const pending = ref(false)
const error = ref<string | null>(null)
const result = ref<PlannerAgentResponse | null>(null)

const promptPresets = [
  'Review this client publishing planner and tell me what needs attention.',
  'Which drafts, queue items, or slots should we fix before generating a plan?',
  'Check account connection readiness before scheduling anything.',
]

function severityColor(severity: string) {
  return severity === 'warning' ? 'warning' : 'info'
}

async function askPlannerAgent() {
  const cleanPrompt = prompt.value.trim()
  if (!cleanPrompt || pending.value || props.disabled || !props.clientId) return
  pending.value = true
  error.value = null
  try {
    result.value = await $fetch<PlannerAgentResponse>('/api/agency/agents/publishing-planner/ask', {
      method: 'POST',
      body: {
        prompt: cleanPrompt,
        context: {
          clientId: props.clientId,
        },
      },
    })
  } catch (err: any) {
    result.value = null
    if (err?.statusCode === 404 || err?.data?.statusCode === 404) {
      error.value = 'Publishing Planner Agent is not enabled in this environment.'
    } else {
      error.value = err?.data?.statusMessage || err?.message || 'Publishing Planner Agent could not complete the review.'
    }
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="rounded-lg border border-default overflow-hidden" data-testid="publishing-planner-agent-panel">
    <div class="flex flex-col gap-3 border-b border-default bg-elevated/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex items-center gap-3">
        <div class="rounded-md bg-default p-2">
          <UIcon name="i-lucide-calendar-check-2" class="size-5 text-primary" />
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-semibold">Publishing Planner Agent</h2>
            <UBadge color="success" variant="soft" size="xs">Read only</UBadge>
            <UBadge v-if="result?.audit.runLoggingAvailable" color="neutral" variant="soft" size="xs">Run logged</UBadge>
          </div>
          <p class="mt-0.5 text-xs text-muted">Reviews campaigns, queue, slots, connected accounts, and upcoming scheduled posts.</p>
        </div>
      </div>
      <UButton
        size="sm"
        icon="i-lucide-sparkles"
        :loading="pending"
        :disabled="disabled || pending || !clientId || !prompt.trim()"
        data-testid="ask-publishing-planner-agent"
        @click="askPlannerAgent"
      >
        Ask Planner
      </UButton>
    </div>

    <div class="grid gap-4 p-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
      <div class="space-y-3">
        <UTextarea
          v-model="prompt"
          :rows="3"
          :disabled="disabled || pending"
          class="w-full"
          aria-label="Publishing Planner Agent prompt"
        />
        <div class="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <UButton
            v-for="preset in promptPresets"
            :key="preset"
            size="xs"
            variant="soft"
            color="neutral"
            class="justify-start"
            :disabled="pending"
            @click="prompt = preset"
          >
            {{ preset }}
          </UButton>
        </div>
      </div>

      <div class="min-h-[150px] rounded-md border border-default bg-default/20 p-4">
        <UAlert
          v-if="error"
          color="warning"
          variant="soft"
          title="Planner Agent unavailable"
          :description="error"
        />
        <div v-else-if="pending" class="flex min-h-[118px] items-center justify-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          Reviewing planner state...
        </div>
        <div v-else-if="!result" class="flex min-h-[118px] items-center justify-center text-center text-sm text-muted">
          Ask for a planner review before generating or scheduling new content.
        </div>
        <div v-else class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="soft" size="xs">{{ result.mode.replace('_', ' ') }}</UBadge>
            <UBadge color="neutral" variant="soft" size="xs">{{ result.audit.toolCallCount }} tool calls</UBadge>
            <UBadge color="success" variant="soft" size="xs">0 direct writes</UBadge>
          </div>
          <p class="text-sm text-default">{{ result.answer }}</p>

          <div class="grid gap-2 text-xs sm:grid-cols-4">
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">Drafts</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.postsByStatus.draft ?? 0 }}</p>
            </div>
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">Queue</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.queueCount }}</p>
            </div>
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">Slots</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.enabledSlots }} / {{ result.summary.totalSlots }}</p>
            </div>
            <div class="rounded-md border border-default p-2">
              <p class="text-muted">Accounts</p>
              <p class="text-base font-semibold text-highlighted">{{ result.summary.activeAccounts }}</p>
            </div>
          </div>

          <div v-if="result.findings.length" class="space-y-2">
            <div v-for="finding in result.findings" :key="finding.title" class="rounded-md border border-default p-3">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :color="severityColor(finding.severity)" variant="soft" size="xs">{{ finding.severity }}</UBadge>
                <p class="text-sm font-medium">{{ finding.title }}</p>
              </div>
              <p class="mt-1 text-xs text-muted">{{ finding.detail }}</p>
            </div>
          </div>

          <div v-if="result.recommendedActions.length" class="rounded-md bg-elevated/40 p-3">
            <p class="text-xs font-medium uppercase text-muted">Safe next steps</p>
            <ul class="mt-2 space-y-1 text-xs text-default">
              <li v-for="action in result.recommendedActions" :key="action" class="flex gap-2">
                <UIcon name="i-lucide-check" class="mt-0.5 size-3 shrink-0 text-success" />
                <span>{{ action }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
