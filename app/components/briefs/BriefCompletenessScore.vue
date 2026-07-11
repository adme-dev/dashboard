<script setup lang="ts">
const props = defineProps<{
  briefId: string
  compact?: boolean
}>()

const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const score = ref<any | null>(null)
const pending = ref(false)

async function refreshScore() {
  pending.value = true
  try {
    score.value = await apiFetch<any>(`/api/agency/briefs/${props.briefId}/score`)
  } finally {
    pending.value = false
  }
}

watch(() => props.briefId, () => {
  refreshScore()
}, { immediate: true })

const scoreColor = computed(() => {
  const s = score.value?.overall || 0
  if (s >= 80) return 'text-emerald-500'
  if (s >= 50) return 'text-amber-500'
  return 'text-red-500'
})

const strokeColor = computed(() => {
  const s = score.value?.overall || 0
  if (s >= 80) return '#10B981'
  if (s >= 50) return '#F59E0B'
  return '#EF4444'
})

const scoreLabel = computed(() => {
  if (!score.value) return 'Loading...'
  if (score.value.overall >= 80) return 'Good'
  if (score.value.overall >= 50) return 'Needs Work'
  return 'Incomplete'
})

// SVG circle math: radius 30, circumference = 2 * PI * 30 ≈ 188.5
const circumference = 2 * Math.PI * 30
const dashOffset = computed(() => {
  const pct = score.value?.overall || 0
  return circumference - (pct / 100) * circumference
})

const expanded = ref(false)

const fieldScoresWithIssues = computed(() => {
  if (!score.value?.fieldScores) return []
  return score.value.fieldScores.filter((fs: any) => fs.score < 80)
})
</script>

<template>
  <div v-if="pending" class="flex justify-center py-4">
    <XfLoader />
  </div>

  <div v-else-if="score" class="space-y-3">
    <!-- Circular SVG Ring + Label -->
    <div class="flex items-center gap-3">
      <div class="relative shrink-0">
        <svg width="72" height="72" viewBox="0 0 72 72">
          <!-- Background ring -->
          <circle
            cx="36"
            cy="36"
            r="30"
            fill="none"
            stroke="currentColor"
            stroke-width="5"
            class="text-muted/20"
          />
          <!-- Progress ring -->
          <circle
            cx="36"
            cy="36"
            r="30"
            fill="none"
            :stroke="strokeColor"
            stroke-width="5"
            stroke-linecap="round"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="dashOffset"
            transform="rotate(-90 36 36)"
            class="transition-all duration-500"
          />
        </svg>
        <!-- Score number in center -->
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-sm font-bold" :class="scoreColor">{{ score.overall }}%</span>
        </div>
      </div>

      <div>
        <p class="text-sm font-medium" :class="scoreColor">{{ scoreLabel }}</p>
        <p class="text-xs text-muted">Completeness</p>
        <p v-if="!compact && score.recommendations?.length" class="text-xs text-muted mt-0.5">
          {{ score.recommendations.length }} suggestion{{ score.recommendations.length > 1 ? 's' : '' }}
        </p>
      </div>

      <!-- Expand toggle (non-compact only) -->
      <UButton
        v-if="!compact && (score.fieldScores?.length || score.recommendations?.length)"
        :icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        variant="ghost"
        size="xs"
        class="ml-auto"
        @click="expanded = !expanded"
      />
    </div>

    <!-- Compact mode stops here -->
    <template v-if="!compact && expanded">
      <!-- Breakdown bars -->
      <div v-if="score.breakdown" class="space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted">Required Fields</span>
          <span class="font-medium">{{ score.breakdown.requiredFieldsScore }}%</span>
        </div>
        <div class="w-full bg-muted/30 rounded-full h-1.5">
          <div
            class="h-1.5 rounded-full transition-all"
            :style="{
              width: `${score.breakdown.requiredFieldsScore}%`,
              backgroundColor: score.breakdown.requiredFieldsScore > 80 ? '#10B981' : score.breakdown.requiredFieldsScore > 50 ? '#F59E0B' : '#EF4444'
            }"
          />
        </div>

        <div class="flex items-center justify-between text-sm">
          <span class="text-muted">Optional Fields</span>
          <span class="font-medium">{{ score.breakdown.optionalFieldsScore }}%</span>
        </div>
        <div class="w-full bg-muted/30 rounded-full h-1.5">
          <div
            class="h-1.5 rounded-full bg-blue-500 transition-all"
            :style="{ width: `${score.breakdown.optionalFieldsScore}%` }"
          />
        </div>

        <div class="flex items-center justify-between text-sm">
          <span class="text-muted">Content Quality</span>
          <span class="font-medium">{{ score.breakdown.contentQualityScore }}%</span>
        </div>
        <div class="w-full bg-muted/30 rounded-full h-1.5">
          <div
            class="h-1.5 rounded-full bg-purple-500 transition-all"
            :style="{ width: `${score.breakdown.contentQualityScore}%` }"
          />
        </div>
      </div>

      <!-- Per-field scores (fields scoring below 80) -->
      <div v-if="score.fieldScores?.length" class="space-y-1.5 pt-1">
        <p class="text-xs font-medium text-muted uppercase tracking-wider">Field Scores</p>
        <div
          v-for="fs in score.fieldScores"
          :key="fs.fieldKey"
          class="space-y-0.5"
        >
          <div class="flex items-center justify-between text-xs">
            <span class="text-muted truncate mr-2">{{ fs.fieldLabel }}</span>
            <span class="font-medium tabular-nums">{{ fs.score }}%</span>
          </div>
          <div class="w-full bg-muted/30 rounded-full h-1">
            <div
              class="h-1 rounded-full transition-all"
              :style="{
                width: `${fs.score}%`,
                backgroundColor: fs.score > 80 ? '#10B981' : fs.score > 50 ? '#F59E0B' : '#EF4444'
              }"
            />
          </div>
          <p v-if="fs.recommendation && fs.score < 80" class="text-xs text-muted pl-1">
            {{ fs.recommendation }}
          </p>
        </div>
      </div>

      <!-- Recommendations -->
      <div v-if="score.recommendations?.length" class="space-y-1.5 pt-1">
        <p class="text-xs font-medium text-muted uppercase tracking-wider">Suggestions</p>
        <div
          v-for="(rec, index) in score.recommendations"
          :key="index"
          class="flex items-start gap-2 text-sm"
        >
          <UIcon name="i-lucide-lightbulb" class="size-4 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
          <span class="text-sm">{{ rec }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
