<script setup lang="ts">
interface PlannerFinding {
  severity: 'warning' | 'info'
  title: string
  detail: string
}

interface PlannerAgentResponse {
  runId: string | null
  mode: 'read_only' | 'draft_only'
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
  drafts?: PlannerDraft[]
  proposedActions: Array<{
    id: string
    type: string
    title: string
    draft: PlannerDraft
  }>
  audit: {
    modelFeatureKey: string
    toolCallCount: number
    blockedActionCount: number
    runLoggingAvailable?: boolean
  }
}

interface PlannerDraft {
  content: string
  platforms: string[]
  platform_overrides: Record<string, { content: string }>
  hashtags: string[]
  suggested_scheduled_at: string | null
}

interface PlannerCampaignOption {
  id: string
  name: string
}

const props = defineProps<{
  clientId: string
  disabled?: boolean
}>()
const emit = defineEmits<{
  draftsCreated: [count: number]
}>()

const prompt = ref('Review this client publishing planner and tell me what needs attention.')
const pending = ref(false)
const accepting = ref(false)
const error = ref<string | null>(null)
const result = ref<PlannerAgentResponse | null>(null)
const draftCards = ref<PlannerDraft[]>([])
const campaigns = ref<PlannerCampaignOption[]>([])
const selectedCampaignId = ref('none')

const promptPresets = [
  'Review this client publishing planner and tell me what needs attention.',
  'Which drafts, queue items, or slots should we fix before generating a plan?',
  'Check account connection readiness before scheduling anything.',
]

const campaignItems = computed(() => [
  { label: 'All campaigns', value: 'none' },
  ...campaigns.value.map(campaign => ({ label: campaign.name, value: campaign.id })),
])

watch(() => props.clientId, async (clientId) => {
  campaigns.value = []
  selectedCampaignId.value = 'none'
  if (!clientId) return
  try {
    campaigns.value = await $fetch<PlannerCampaignOption[]>('/api/agency/social/publishing/campaigns', {
      query: { clientId },
    })
  } catch {
    campaigns.value = []
  }
}, { immediate: true })

function severityColor(severity: string) {
  return severity === 'warning' ? 'warning' : 'info'
}

async function runPlannerAgent(draftPlan = false) {
  const cleanPrompt = prompt.value.trim()
  if (!cleanPrompt || pending.value || props.disabled || !props.clientId) return
  pending.value = true
  error.value = null
  if (draftPlan) draftCards.value = []
  const context: Record<string, unknown> = {
    clientId: props.clientId,
  }
  if (selectedCampaignId.value !== 'none') {
    context.campaignId = selectedCampaignId.value
  }
  if (draftPlan) {
    context.draftPlan = true
    context.brief = cleanPrompt
    context.count = 5
    context.platforms = ['facebook', 'instagram']
  }
  try {
    result.value = await $fetch<PlannerAgentResponse>('/api/agency/agents/publishing-planner/ask', {
      method: 'POST',
      body: {
        prompt: cleanPrompt,
        context,
      },
    })
    draftCards.value = result.value.drafts ? result.value.drafts.map(draft => ({
      content: draft.content,
      platforms: [...draft.platforms],
      platform_overrides: JSON.parse(JSON.stringify(draft.platform_overrides || {})),
      hashtags: [...draft.hashtags],
      suggested_scheduled_at: draft.suggested_scheduled_at,
    })) : []
  } catch (err: any) {
    result.value = null
    draftCards.value = []
    if (err?.statusCode === 404 || err?.data?.statusCode === 404) {
      error.value = 'Publishing Planner Agent is not enabled in this environment.'
    } else {
      error.value = err?.data?.statusMessage || err?.message || 'Publishing Planner Agent could not complete the review.'
    }
  } finally {
    pending.value = false
  }
}

function askPlannerAgent() {
  return runPlannerAgent(false)
}

function generateDrafts() {
  return runPlannerAgent(true)
}

function discardDraft(index: number) {
  draftCards.value.splice(index, 1)
}

function draftVariantPlatforms(draft: PlannerDraft) {
  return Object.keys(draft.platform_overrides || {})
}

async function acceptDrafts() {
  if (!draftCards.value.length || accepting.value || props.disabled || !props.clientId) return
  accepting.value = true
  let created = 0
  try {
    for (const draft of draftCards.value) {
      await $fetch('/api/agency/social/publishing/posts', {
        method: 'POST',
        body: {
          clientId: props.clientId,
          campaignId: selectedCampaignId.value === 'none' ? undefined : selectedCampaignId.value,
          content: draft.content,
          platforms: draft.platforms,
          platformOverrides: draft.platform_overrides,
          hashtags: draft.hashtags,
          scheduledAt: draft.suggested_scheduled_at,
          metadata: {
            source: 'publishing_planner_agent',
            agentRunId: result.value?.runId ?? null,
          },
        },
      })
      created += 1
    }
    draftCards.value = []
    emit('draftsCreated', created)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || 'Could not add all planner drafts.'
    if (created) emit('draftsCreated', created)
  } finally {
    accepting.value = false
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
      <div class="flex flex-wrap gap-2">
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
        <UButton
          size="sm"
          icon="i-lucide-file-plus-2"
          variant="soft"
          :loading="pending"
          :disabled="disabled || pending || !clientId || !prompt.trim()"
          data-testid="generate-publishing-planner-drafts"
          @click="generateDrafts"
        >
          Generate drafts
        </UButton>
      </div>
    </div>

    <div class="grid gap-4 p-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
      <div class="space-y-3">
        <USelectMenu
          v-model="selectedCampaignId"
          :items="campaignItems"
          value-key="value"
          label-key="label"
          class="w-full"
          :disabled="disabled || pending"
          aria-label="Publishing Planner Agent campaign scope"
        />
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
            <UBadge v-if="result.runId" color="neutral" variant="soft" size="xs">Run {{ result.runId }}</UBadge>
            <UBadge color="success" variant="soft" size="xs">0 direct writes</UBadge>
          </div>
          <p class="text-sm text-default">{{ result.answer }}</p>

          <div v-if="draftCards.length" class="space-y-3" data-testid="publishing-planner-draft-cards">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs font-medium uppercase text-muted">Editable draft suggestions</p>
              <UButton
                size="xs"
                icon="i-lucide-plus"
                :loading="accepting"
                :disabled="accepting || !draftCards.length"
                data-testid="accept-publishing-planner-drafts"
                @click="acceptDrafts"
              >
                Add {{ draftCards.length }} draft{{ draftCards.length === 1 ? '' : 's' }}
              </UButton>
            </div>
            <div v-for="(draft, index) in draftCards" :key="index" class="rounded-md border border-default p-3">
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <UBadge v-for="platform in draft.platforms" :key="platform" size="xs" color="neutral" variant="soft">{{ platform }}</UBadge>
                <span class="ml-auto text-xs text-muted">{{ draft.suggested_scheduled_at ? new Date(draft.suggested_scheduled_at).toLocaleString() : 'No schedule hint' }}</span>
                <UButton
                  size="xs"
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  :disabled="accepting"
                  :aria-label="`Discard draft ${index + 1}`"
                  data-testid="discard-publishing-planner-draft"
                  @click="discardDraft(index)"
                />
              </div>
              <UTextarea v-model="draft.content" :rows="3" class="w-full" :disabled="accepting" />
              <div v-if="draftVariantPlatforms(draft).length" class="mt-3 space-y-2">
                <div v-for="platform in draftVariantPlatforms(draft)" :key="platform">
                  <p class="mb-1 text-xs text-muted">{{ platform }}</p>
                  <UTextarea v-model="draft.platform_overrides[platform].content" :rows="2" class="w-full" :disabled="accepting" />
                </div>
              </div>
              <div v-if="draft.hashtags.length" class="mt-3 flex flex-wrap gap-1">
                <UBadge v-for="tag in draft.hashtags" :key="tag" size="xs" color="primary" variant="soft">#{{ tag.replace(/^#/, '') }}</UBadge>
              </div>
            </div>
          </div>

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
