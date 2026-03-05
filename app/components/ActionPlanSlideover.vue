<script setup lang="ts">
interface ActionPlanItem {
  type: 'anomaly' | 'recommendation' | 'insight'
  title: string
  description: string
  severity?: string
  category?: string
  metric?: { label: string, value: string | number }
  recommendation?: string
  actionSteps?: string[]
  tags?: string[]
}

interface ActionStep {
  step: number
  action: string
  detail: string
  priority: 'immediate' | 'short-term' | 'medium-term'
  owner?: string
}

interface RegulatoryReference {
  body: string
  relevance: string
  url?: string
}

interface IndustryInsight {
  category: 'benchmark' | 'best-practice' | 'tip'
  title: string
  detail: string
  sourceName?: string
  sourceUrl?: string
}

interface ActionPlanResponse {
  summary: string
  actionSteps: ActionStep[]
  regulatoryContext: string
  references: RegulatoryReference[]
  timeline: string
  riskAssessment: string
  estimatedImpact: string
  xeroDataUsed: string[]
  vectorizeContextUsed: boolean
  industryInsights?: IndustryInsight[]
}

const props = defineProps<{
  open: boolean
  item: ActionPlanItem | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const toast = useToast()

const plan = ref<ActionPlanResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)
const savedId = ref<string | null>(null)

const priorityConfig: Record<string, { color: 'error' | 'warning' | 'info', label: string, icon: string }> = {
  immediate: { color: 'error', label: 'Immediate', icon: 'i-lucide-zap' },
  'short-term': { color: 'warning', label: 'Short-term', icon: 'i-lucide-clock' },
  'medium-term': { color: 'info', label: 'Medium-term', icon: 'i-lucide-calendar' },
}

async function fetchPlan() {
  if (!props.item) return

  plan.value = null
  error.value = null
  loading.value = true
  savedId.value = null

  try {
    plan.value = await $fetch<ActionPlanResponse>('/api/ai/action-plan', {
      method: 'POST',
      body: props.item,
    })
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to generate action plan'
  } finally {
    loading.value = false
  }
}

async function savePlan() {
  if (!plan.value || !props.item || saving.value) return

  saving.value = true
  try {
    const result = await $fetch<{ id: string }>('/api/ai/saved-plans', {
      method: 'POST',
      body: {
        sourceType: props.item.type,
        sourceTitle: props.item.title,
        sourceDescription: props.item.description,
        sourceSeverity: props.item.severity,
        sourceCategory: props.item.category,
        planData: plan.value,
      },
    })
    savedId.value = result.id
    toast.add({ title: 'Plan saved', description: 'This action plan is now pinned and available in AI Chat.', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Could not save', description: err?.data?.statusMessage || 'Failed to save action plan.', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function unsavePlan() {
  if (!savedId.value) return

  try {
    await $fetch(`/api/ai/saved-plans/${savedId.value}`, { method: 'DELETE' })
    savedId.value = null
    toast.add({ title: 'Plan removed', description: 'Action plan unpinned.', color: 'info' })
  } catch {
    toast.add({ title: 'Error', description: 'Could not remove saved plan.', color: 'error' })
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen && props.item) {
    fetchPlan()
  } else if (!isOpen) {
    plan.value = null
    error.value = null
    savedId.value = null
  }
})
</script>

<template>
  <USlideover
    :open="open"
    title="AI Action Plan"
    :description="item?.title || 'Generating recommendations...'"
    @update:open="emit('update:open', $event)"
  >
    <template #title>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sparkles" class="size-5 text-primary" />
        <span>AI Action Plan</span>
      </div>
    </template>

    <template #actions>
      <UButton
        v-if="plan && !savedId"
        icon="i-lucide-pin"
        label="Save"
        color="primary"
        variant="soft"
        size="xs"
        :loading="saving"
        @click="savePlan"
      />
      <UButton
        v-else-if="plan && savedId"
        icon="i-lucide-pin-off"
        label="Saved"
        color="success"
        variant="soft"
        size="xs"
        @click="unsavePlan"
      />
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="loading" class="space-y-6">
        <div class="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div class="relative flex size-8 items-center justify-center">
            <div class="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <UIcon name="i-lucide-brain" class="size-5 text-primary relative" />
          </div>
          <div>
            <p class="text-sm font-medium">
              Generating action plan...
            </p>
            <p class="text-xs text-muted">
              Analysing Xero data, knowledge base, and Australian regulations
            </p>
          </div>
        </div>

        <div class="space-y-4">
          <USkeleton class="h-20" />
          <USkeleton class="h-32" />
          <USkeleton class="h-24" />
          <USkeleton class="h-16" />
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="space-y-4">
        <UAlert
          color="error"
          icon="i-lucide-alert-circle"
          title="Could not generate action plan"
          :description="error"
          variant="subtle"
        />
        <UButton
          label="Retry"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="subtle"
          @click="fetchPlan()"
        />
      </div>

      <!-- Action Plan Content -->
      <div v-else-if="plan" class="space-y-6">
        <!-- Data Sources Badge Row -->
        <div v-if="plan.xeroDataUsed.length > 0 || plan.vectorizeContextUsed" class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted">Sources:</span>
          <UBadge
            v-for="source in plan.xeroDataUsed"
            :key="source"
            :color="source === 'Web Research' ? 'success' : 'primary'"
            variant="subtle"
            size="xs"
          >
            <UIcon :name="source === 'Web Research' ? 'i-lucide-globe' : 'i-lucide-database'" class="size-3 mr-1" />
            {{ source }}
          </UBadge>
          <UBadge
            v-if="plan.vectorizeContextUsed"
            color="info"
            variant="subtle"
            size="xs"
          >
            <UIcon name="i-lucide-brain" class="size-3 mr-1" />
            Knowledge Base
          </UBadge>
        </div>

        <!-- Summary -->
        <div class="rounded-lg border border-default bg-elevated/50 p-4">
          <h3 class="text-sm font-medium">
            Summary
          </h3>
          <p class="mt-2 text-sm text-muted leading-relaxed">
            {{ plan.summary }}
          </p>
        </div>

        <!-- Estimated Impact -->
        <div v-if="plan.estimatedImpact" class="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-400/30 dark:bg-emerald-500/10">
          <UIcon name="i-lucide-trending-up" class="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p class="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              Estimated Impact
            </p>
            <p class="mt-1 text-sm text-emerald-700 dark:text-emerald-100/80">
              {{ plan.estimatedImpact }}
            </p>
          </div>
        </div>

        <!-- Action Steps -->
        <div class="space-y-3">
          <h3 class="flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-list-checks" class="size-4 text-primary" />
            Action Steps
          </h3>

          <div
            v-for="step in plan.actionSteps"
            :key="step.step"
            class="rounded-lg border border-default p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3">
                <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {{ step.step }}
                </span>
                <div>
                  <p class="font-medium">
                    {{ step.action }}
                  </p>
                  <p class="mt-1 text-sm text-muted leading-relaxed">
                    {{ step.detail }}
                  </p>
                </div>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2 pl-10">
              <UBadge
                :color="priorityConfig[step.priority]?.color || 'info'"
                variant="subtle"
                size="xs"
              >
                <UIcon :name="priorityConfig[step.priority]?.icon || 'i-lucide-clock'" class="size-3 mr-1" />
                {{ priorityConfig[step.priority]?.label || step.priority }}
              </UBadge>
              <UBadge
                v-if="step.owner"
                color="neutral"
                variant="soft"
                size="xs"
              >
                <UIcon name="i-lucide-user" class="size-3 mr-1" />
                {{ step.owner }}
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Industry Best Practices -->
        <div v-if="plan.industryInsights?.length" class="space-y-3">
          <h3 class="flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-lightbulb" class="size-4 text-amber-500" />
            Agency Industry Insights
          </h3>
          <div class="space-y-2">
            <div
              v-for="(insight, i) in plan.industryInsights"
              :key="i"
              class="rounded-lg border border-default p-3"
            >
              <div class="flex items-start gap-3">
                <UBadge :color="insight.category === 'benchmark' ? 'primary' : insight.category === 'best-practice' ? 'success' : 'info'" variant="subtle" size="xs" class="shrink-0 mt-0.5">
                  {{ insight.category === 'benchmark' ? 'Benchmark' : insight.category === 'best-practice' ? 'Best Practice' : 'Tip' }}
                </UBadge>
                <div class="flex-1">
                  <p class="text-sm font-medium">
                    {{ insight.title }}
                  </p>
                  <p class="mt-1 text-sm text-muted">
                    {{ insight.detail }}
                  </p>
                  <a
                    v-if="insight.sourceUrl"
                    :href="insight.sourceUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <UIcon name="i-lucide-external-link" class="size-3" />
                    {{ insight.sourceName || 'Source' }}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Timeline -->
        <div v-if="plan.timeline" class="flex items-start gap-3 rounded-lg border border-default p-4">
          <UIcon name="i-lucide-calendar-clock" class="size-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p class="text-sm font-medium">
              Timeline
            </p>
            <p class="mt-1 text-sm text-muted">
              {{ plan.timeline }}
            </p>
          </div>
        </div>

        <!-- Risk Assessment -->
        <div v-if="plan.riskAssessment" class="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/30 dark:bg-amber-500/10">
          <UIcon name="i-lucide-shield-alert" class="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p class="text-sm font-medium text-amber-800 dark:text-amber-200">
              Risk if Not Addressed
            </p>
            <p class="mt-1 text-sm text-amber-700 dark:text-amber-100/80">
              {{ plan.riskAssessment }}
            </p>
          </div>
        </div>

        <!-- Regulatory Context -->
        <div v-if="plan.regulatoryContext" class="space-y-3">
          <h3 class="flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-scale" class="size-4 text-primary" />
            Australian Regulatory Context
          </h3>
          <div class="rounded-lg border border-default bg-elevated/50 p-4">
            <p class="text-sm text-muted leading-relaxed">
              {{ plan.regulatoryContext }}
            </p>
          </div>
        </div>

        <!-- References -->
        <div v-if="plan.references.length > 0" class="space-y-3">
          <h3 class="flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-bookmark" class="size-4 text-primary" />
            Regulatory References
          </h3>
          <div class="space-y-2">
            <div
              v-for="(ref, i) in plan.references"
              :key="i"
              class="flex items-start gap-3 rounded-lg border border-default p-3"
            >
              <UBadge color="neutral" variant="subtle" size="xs" class="shrink-0 mt-0.5">
                {{ ref.body }}
              </UBadge>
              <div class="flex-1">
                <p class="text-sm text-muted">
                  {{ ref.relevance }}
                </p>
                <a
                  v-if="ref.url"
                  :href="ref.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <UIcon name="i-lucide-external-link" class="size-3" />
                  Official guidance
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div v-if="plan" class="space-y-3 w-full">
        <div v-if="savedId" class="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <UIcon name="i-lucide-pin" class="size-4 text-primary shrink-0" />
          <p class="text-xs text-primary flex-1">
            Saved! This plan is available in
            <NuxtLink to="/agency/ai" class="underline font-medium">AI Chat</NuxtLink>
            as financial context.
          </p>
        </div>
        <div class="flex items-center justify-between">
          <p class="text-xs text-muted">
            AI-generated plan. Verify with your accountant.
          </p>
          <UButton
            label="Regenerate"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="loading"
            @click="fetchPlan()"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
