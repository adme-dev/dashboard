<script setup lang="ts">
interface SpendControllerFinding {
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  sourceRefs: Array<{ type: string, id?: string, label: string }>
}

interface SpendControllerResponse {
  runId: string | null
  mode: 'read_only' | 'read_propose'
  answer: string
  findings: SpendControllerFinding[]
  recommendedActions: string[]
  proposedActions: Array<{
    type: string
    label: string
    status: string
    payloadRef?: string | null
    rationale: string[]
  }>
  audit: {
    modelFeatureKey: string
    toolCallCount: number
    blockedActionCount: number
    runLoggingAvailable?: boolean
  }
}

const props = defineProps<{
  month: number
  year: number
  platform: string
  disabled?: boolean
}>()

const prompt = ref('What spend issues need attention today?')
const pending = ref(false)
const proposalPending = ref(false)
const ignoredProposalRefs = ref<Set<string>>(new Set())
const ignoredProposalPending = ref<Record<string, boolean>>({})
const error = ref<string | null>(null)
const result = ref<SpendControllerResponse | null>(null)

const period = computed(() => `${props.year}-${String(props.month).padStart(2, '0')}`)
const promptPresets = [
  'What spend issues need attention today?',
  'Which critical campaigns should we review first?',
  'Check stale syncs before any budget recommendations.',
  'Summarize pacing risk for this period.',
]

function severityColor(severity: string) {
  if (severity === 'critical') return 'error'
  if (severity === 'warning') return 'warning'
  return 'info'
}

function usePreset(value: string) {
  prompt.value = value
}

async function runSpendController(options: { draftActions?: boolean } = {}) {
  const cleanPrompt = prompt.value.trim()
  if (!cleanPrompt || pending.value || proposalPending.value || props.disabled) return

  if (options.draftActions) proposalPending.value = true
  else pending.value = true
  error.value = null
  try {
    result.value = await $fetch<SpendControllerResponse>('/api/agency/agents/spend-controller/ask', {
      method: 'POST',
      body: {
        prompt: cleanPrompt,
        ...(options.draftActions ? { draftActions: true } : {}),
        context: {
          period: period.value,
          platform: props.platform,
        },
      },
    })
    ignoredProposalRefs.value = new Set()
  } catch (err: any) {
    result.value = null
    if (err?.statusCode === 404 || err?.data?.statusCode === 404) {
      error.value = 'Spend Controller is not enabled in this environment.'
    } else if (err?.statusCode === 403 || err?.data?.statusCode === 403) {
      error.value = 'Spend Controller proposal mode is not enabled for this environment.'
    } else {
      error.value = err?.data?.statusMessage || err?.message || 'Spend Controller could not complete the review.'
    }
  } finally {
    pending.value = false
    proposalPending.value = false
  }
}

function askSpendController() {
  return runSpendController()
}

function draftActionPlans() {
  return runSpendController({ draftActions: true })
}

async function markProposalIgnored(actionRef: string | null | undefined) {
  if (!actionRef || ignoredProposalPending.value[actionRef]) return
  ignoredProposalPending.value = { ...ignoredProposalPending.value, [actionRef]: true }
  try {
    await $fetch(`/api/agency/agents/spend-controller/proposals/${actionRef}/decision`, {
      method: 'POST',
      body: {
        decision: 'ignored',
      },
    })
    const next = new Set(ignoredProposalRefs.value)
    next.add(actionRef)
    ignoredProposalRefs.value = next
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || 'Could not mark the proposal ignored.'
  } finally {
    const { [actionRef]: _done, ...rest } = ignoredProposalPending.value
    ignoredProposalPending.value = rest
  }
}
</script>

<template>
  <section class="rounded-xl border border-default overflow-hidden" data-testid="spend-controller-panel">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-default bg-elevated/30">
      <div class="flex items-center gap-3">
        <div class="rounded-lg bg-default p-2">
          <UIcon name="i-lucide-brain-circuit" class="size-5 text-primary" />
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-semibold">Spend Controller</h2>
            <UBadge color="success" variant="soft" size="xs">Read only</UBadge>
            <UBadge v-if="result?.audit.runLoggingAvailable" color="neutral" variant="soft" size="xs">
              Run logged
            </UBadge>
          </div>
          <p class="text-xs text-muted mt-0.5">
            Reviews pacing data and drafts guidance. It cannot execute budget or campaign changes.
          </p>
        </div>
      </div>
      <UButton
        size="sm"
        icon="i-lucide-sparkles"
        :loading="pending"
        :disabled="disabled || pending || proposalPending || !prompt.trim()"
        data-testid="ask-spend-controller"
        @click="askSpendController"
      >
        Ask Controller
      </UButton>
    </div>

    <div class="grid gap-4 p-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
      <div class="space-y-3">
        <UTextarea
          v-model="prompt"
          :rows="4"
          :disabled="disabled || pending"
          class="w-full"
          aria-label="Spend Controller prompt"
        />
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <UButton
            v-for="preset in promptPresets"
            :key="preset"
            size="xs"
            variant="soft"
            color="neutral"
            class="justify-start"
            :disabled="pending"
            @click="usePreset(preset)"
          >
            {{ preset }}
          </UButton>
        </div>
        <p class="text-xs text-muted">
          Scope: {{ period }} · {{ platform === 'all' ? 'all Meta and Google spend' : platform }}
        </p>
      </div>

      <div class="min-h-[180px] rounded-lg border border-default bg-default/20 p-4">
        <UAlert
          v-if="error"
          color="warning"
          variant="soft"
          title="Spend Controller unavailable"
          :description="error"
        />
        <div v-else-if="pending" class="flex h-full min-h-[148px] items-center justify-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          Reviewing spend pacing...
        </div>
        <div v-else-if="!result" class="flex h-full min-h-[148px] items-center justify-center text-center text-sm text-muted">
          Ask for a spend review to get prioritized findings and safe next steps.
        </div>
        <div v-else class="space-y-4">
          <div>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="neutral" variant="soft" size="xs">{{ result.mode.replace('_', ' ') }}</UBadge>
                <UBadge color="neutral" variant="soft" size="xs">{{ result.audit.toolCallCount }} tool call{{ result.audit.toolCallCount === 1 ? '' : 's' }}</UBadge>
                <UBadge v-if="result.runId" color="neutral" variant="soft" size="xs">Run {{ result.runId }}</UBadge>
                <UBadge color="success" variant="soft" size="xs">0 direct writes</UBadge>
              </div>
              <UButton
                v-if="result.findings.length"
                size="xs"
                color="primary"
                variant="soft"
                icon="i-lucide-file-plus-2"
                :loading="proposalPending"
                :disabled="pending || proposalPending"
                data-testid="draft-spend-controller-actions"
                @click="draftActionPlans"
              >
                Draft action plans
              </UButton>
            </div>
            <p class="text-sm text-default">{{ result.answer }}</p>
          </div>

          <div v-if="result.proposedActions.length" class="space-y-2">
            <div
              v-for="action in result.proposedActions"
              :key="`${action.type}:${action.payloadRef || action.label}`"
              class="rounded-md border border-default bg-success/5 p-3"
            >
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :color="action.payloadRef && ignoredProposalRefs.has(action.payloadRef) ? 'neutral' : 'success'" variant="soft" size="xs">
                  {{ action.payloadRef && ignoredProposalRefs.has(action.payloadRef) ? 'Ignored' : 'Drafted' }}
                </UBadge>
                <p class="text-sm font-medium">{{ action.label }}</p>
              </div>
              <p class="mt-1 text-xs text-muted">
                Requires approval in the existing campaign action flow before anything executes.
              </p>
              <div v-if="action.payloadRef" class="mt-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  :loading="ignoredProposalPending[action.payloadRef]"
                  :disabled="ignoredProposalRefs.has(action.payloadRef)"
                  data-testid="ignore-spend-controller-proposal"
                  @click="markProposalIgnored(action.payloadRef)"
                >
                  Mark ignored
                </UButton>
              </div>
              <ul v-if="action.rationale.length" class="mt-2 space-y-1 text-xs text-default">
                <li v-for="reason in action.rationale" :key="reason" class="flex gap-2">
                  <UIcon name="i-lucide-check" class="mt-0.5 size-3 text-success shrink-0" />
                  <span>{{ reason }}</span>
                </li>
              </ul>
            </div>
          </div>

          <div v-if="result.findings.length" class="space-y-3">
            <div
              v-for="finding in result.findings"
              :key="`${finding.title}:${finding.sourceRefs[0]?.id || 'source'}`"
              class="rounded-md border border-default p-3"
            >
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :color="severityColor(finding.severity)" variant="soft" size="xs">
                  {{ finding.severity }}
                </UBadge>
                <p class="text-sm font-medium">{{ finding.title }}</p>
              </div>
              <p class="mt-2 text-xs text-muted">{{ finding.detail }}</p>
              <div v-if="finding.sourceRefs.length" class="mt-2 flex flex-wrap gap-1">
                <UBadge
                  v-for="source in finding.sourceRefs"
                  :key="`${source.type}:${source.id || source.label}`"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  {{ source.label }}
                </UBadge>
              </div>
            </div>
          </div>

          <div v-if="result.recommendedActions.length" class="rounded-md bg-elevated/40 p-3">
            <p class="text-xs font-medium uppercase text-muted">Safe next steps</p>
            <ul class="mt-2 space-y-1 text-xs text-default">
              <li v-for="action in result.recommendedActions" :key="action" class="flex gap-2">
                <UIcon name="i-lucide-check" class="mt-0.5 size-3 text-success shrink-0" />
                <span>{{ action }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
