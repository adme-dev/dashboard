<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

interface KeyMetric {
  label: string
  value: string
  format?: string
  trend?: 'up' | 'down' | 'flat'
  context?: string
}

interface Insight {
  title: string
  detail: string
  severity: 'success' | 'info' | 'warning' | 'critical'
  metric?: { label: string, value: string }
  comparison?: { label: string, value: string, trend?: 'up' | 'down' }
  tags?: string[]
}

interface Section {
  id: string
  title: string
  icon: string
  insights: Insight[]
}

interface Recommendation {
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
  category: string
  actionSteps?: string[]
}

interface InsightsResponse {
  generatedAt: string
  executiveSummary: {
    headline: string
    healthScore: number
    healthLabel: string
    keyMetrics: KeyMetric[]
  }
  sections: Section[]
  recommendations: Recommendation[]
}

const { data, pending, error, refresh } = await useFetch<InsightsResponse>('/api/ai/insights', {
  lazy: true
})

const breadcrumbs = computed(() => ([
  { label: 'Reports', to: '/reports' },
  { label: 'Financial Insights', to: '/insights' }
]))

const sectionIcons: Record<string, string> = {
  profitability: 'i-lucide-piggy-bank',
  'cash-position': 'i-lucide-wallet',
  revenue: 'i-lucide-receipt',
  expenses: 'i-lucide-credit-card',
  budget: 'i-lucide-calculator'
}

const severityConfig: Record<string, { color: 'success' | 'info' | 'warning' | 'error', icon: string }> = {
  success: { color: 'success', icon: 'i-lucide-check-circle' },
  info: { color: 'info', icon: 'i-lucide-info' },
  warning: { color: 'warning', icon: 'i-lucide-alert-triangle' },
  critical: { color: 'error', icon: 'i-lucide-alert-octagon' }
}

const impactConfig: Record<string, { color: 'error' | 'warning' | 'info', label: string }> = {
  high: { color: 'error', label: 'High Impact' },
  medium: { color: 'warning', label: 'Medium Impact' },
  low: { color: 'info', label: 'Low Impact' }
}

function healthScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-500'
  if (score >= 65) return 'text-blue-500'
  if (score >= 50) return 'text-amber-500'
  if (score >= 35) return 'text-orange-500'
  return 'text-red-500'
}

function healthScoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500/10 border-emerald-500/20'
  if (score >= 65) return 'bg-blue-500/10 border-blue-500/20'
  if (score >= 50) return 'bg-amber-500/10 border-amber-500/20'
  if (score >= 35) return 'bg-orange-500/10 border-orange-500/20'
  return 'bg-red-500/10 border-red-500/20'
}

function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

// ── Action Plan Slideover ──
const actionPlanOpen = ref(false)
const actionPlanItem = ref<{
  type: 'recommendation' | 'insight'
  title: string
  description: string
  severity?: string
  category?: string
  metric?: { label: string, value: string | number }
  actionSteps?: string[]
  tags?: string[]
} | null>(null)

function openRecommendationPlan(rec: Recommendation) {
  actionPlanItem.value = {
    type: 'recommendation',
    title: rec.title,
    description: rec.description,
    severity: rec.impact === 'high' ? 'critical' : rec.impact === 'medium' ? 'warning' : 'info',
    category: rec.category,
    actionSteps: rec.actionSteps,
  }
  actionPlanOpen.value = true
}

function openInsightPlan(insight: Insight, sectionTitle: string) {
  actionPlanItem.value = {
    type: 'insight',
    title: insight.title,
    description: insight.detail,
    severity: insight.severity,
    category: sectionTitle,
    metric: insight.metric ? { label: insight.metric.label, value: insight.metric.value } : undefined,
    tags: insight.tags,
  }
  actionPlanOpen.value = true
}
</script>

<template>
  <UDashboardPanel id="insights">
    <template #header>
      <UDashboardNavbar
        title="Financial Insights"
        description="AI-powered analysis across 8 Xero data sources"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            label="Refresh"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :items="breadcrumbs" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="pending" class="space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <USkeleton v-for="n in 6" :key="n" class="h-24" />
        </div>
        <USkeleton class="h-48" />
        <USkeleton class="h-64" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="space-y-6">
        <UAlert
          color="error"
          icon="i-lucide-alert-circle"
          title="Failed to load insights"
          :description="error.statusMessage || 'We could not generate financial insights. Ensure Xero is connected and try again.'"
          variant="subtle"
        />
      </div>

      <!-- Content -->
      <div v-else-if="data" class="space-y-8">
        <!-- Executive Summary -->
        <div class="space-y-4">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-4">
              <!-- Health Score Badge -->
              <div :class="['flex flex-col items-center justify-center rounded-xl border px-4 py-3', healthScoreBg(data.executiveSummary.healthScore)]">
                <span :class="['text-3xl font-bold', healthScoreColor(data.executiveSummary.healthScore)]">
                  {{ data.executiveSummary.healthScore }}
                </span>
                <span class="text-xs text-muted">
                  / 100
                </span>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-lg font-semibold">
                    {{ data.executiveSummary.healthLabel }}
                  </h2>
                  <UBadge
                    :color="data.executiveSummary.healthScore >= 65 ? 'success' : data.executiveSummary.healthScore >= 50 ? 'warning' : 'error'"
                    variant="subtle"
                    size="sm"
                  >
                    Health Score
                  </UBadge>
                </div>
                <p class="mt-1 text-sm text-muted max-w-lg">
                  {{ data.executiveSummary.headline }}
                </p>
              </div>
            </div>
            <p v-if="data.generatedAt" class="text-xs text-muted whitespace-nowrap">
              Updated {{ formatDate(data.generatedAt) }}
            </p>
          </div>

          <!-- Key Metrics Grid -->
          <div v-if="data.executiveSummary.keyMetrics.length" class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <UCard v-for="(metric, i) in data.executiveSummary.keyMetrics" :key="i">
              <p class="text-xs text-muted truncate">
                {{ metric.label }}
              </p>
              <div class="mt-1 flex items-center gap-1.5">
                <p class="text-lg font-semibold truncate">
                  {{ metric.value }}
                </p>
                <UIcon
                  v-if="metric.trend"
                  :name="metric.trend === 'up' ? 'i-lucide-arrow-up-right' : metric.trend === 'down' ? 'i-lucide-arrow-down-right' : 'i-lucide-minus'"
                  :class="[
                    metric.trend === 'up' ? 'text-emerald-500' : metric.trend === 'down' ? 'text-red-500' : 'text-muted',
                    'size-4 shrink-0'
                  ]"
                />
              </div>
              <p v-if="metric.context" class="mt-1 text-xs text-muted">
                {{ metric.context }}
              </p>
            </UCard>
          </div>
        </div>

        <!-- Sections -->
        <div v-if="data.sections.length" class="space-y-8">
          <section
            v-for="section in data.sections"
            :key="section.id"
            class="space-y-4"
          >
            <div class="flex items-center gap-2">
              <UIcon :name="sectionIcons[section.id] || section.icon" class="size-5 text-primary" />
              <h2 class="text-lg font-semibold">
                {{ section.title }}
              </h2>
              <UBadge color="neutral" variant="subtle" size="sm">
                {{ section.insights.length }} {{ section.insights.length === 1 ? 'insight' : 'insights' }}
              </UBadge>
            </div>

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <UCard
                v-for="(insight, i) in section.insights"
                :key="i"
                :ui="{ body: 'space-y-3' }"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <UBadge
                      :color="severityConfig[insight.severity]?.color || 'info'"
                      variant="subtle"
                      size="sm"
                    >
                      <div class="flex items-center gap-1">
                        <UIcon :name="severityConfig[insight.severity]?.icon || 'i-lucide-info'" class="size-3.5" />
                        <span class="capitalize">{{ insight.severity }}</span>
                      </div>
                    </UBadge>
                  </div>
                  <div v-if="insight.metric" class="text-right shrink-0">
                    <p class="text-xs text-muted">
                      {{ insight.metric.label }}
                    </p>
                    <p class="text-sm font-semibold">
                      {{ insight.metric.value }}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 class="font-medium">
                    {{ insight.title }}
                  </h3>
                  <p class="mt-1 text-sm text-muted">
                    {{ insight.detail }}
                  </p>
                </div>

                <div v-if="insight.comparison" class="flex items-center gap-2 text-sm">
                  <span class="text-muted">{{ insight.comparison.label }}:</span>
                  <span class="font-medium">{{ insight.comparison.value }}</span>
                  <UIcon
                    v-if="insight.comparison.trend"
                    :name="insight.comparison.trend === 'up' ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'"
                    :class="[
                      insight.comparison.trend === 'up' ? 'text-emerald-500' : 'text-red-500',
                      'size-4'
                    ]"
                  />
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    v-if="insight.severity === 'warning' || insight.severity === 'critical'"
                    label="AI Action Plan"
                    icon="i-lucide-sparkles"
                    color="primary"
                    variant="soft"
                    size="xs"
                    @click="openInsightPlan(insight, section.title)"
                  />
                  <template v-if="insight.tags?.length">
                    <UBadge
                      v-for="tag in insight.tags"
                      :key="tag"
                      color="neutral"
                      variant="soft"
                      size="xs"
                    >
                      {{ tag }}
                    </UBadge>
                  </template>
                </div>
              </UCard>
            </div>
          </section>
        </div>

        <!-- Empty state (no sections at all) -->
        <div v-if="!data.sections.length" class="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted/60 bg-muted/20 py-16 text-center">
          <UIcon name="i-lucide-bar-chart-3" class="size-10 text-muted" />
          <p class="mt-4 text-lg font-semibold">
            No insights available
          </p>
          <p class="mt-2 max-w-md text-sm text-muted">
            We could not generate insights from the available data. Ensure Xero is connected and has recent financial data.
          </p>
        </div>

        <!-- Recommendations -->
        <div v-if="data.recommendations.length" class="space-y-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-lightbulb" class="size-5 text-amber-500" />
            <h2 class="text-lg font-semibold">
              Recommendations
            </h2>
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ data.recommendations.length }}
            </UBadge>
          </div>

          <div class="space-y-3">
            <UCard
              v-for="(rec, i) in data.recommendations"
              :key="i"
              :ui="{ body: 'space-y-3' }"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 class="font-medium">
                    {{ rec.title }}
                  </h3>
                  <p class="mt-1 text-sm text-muted">
                    {{ rec.description }}
                  </p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <UBadge
                    :color="impactConfig[rec.impact]?.color || 'info'"
                    variant="subtle"
                    size="sm"
                  >
                    {{ impactConfig[rec.impact]?.label || rec.impact }}
                  </UBadge>
                  <UBadge color="neutral" variant="soft" size="sm">
                    {{ rec.category }}
                  </UBadge>
                </div>
              </div>

              <div v-if="rec.actionSteps?.length" class="rounded-lg border border-muted/40 p-3">
                <p class="text-xs font-medium text-muted uppercase tracking-wide mb-2">
                  Action Steps
                </p>
                <ol class="space-y-1.5 text-sm">
                  <li
                    v-for="(step, si) in rec.actionSteps"
                    :key="si"
                    class="flex items-start gap-2"
                  >
                    <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary mt-0.5">
                      {{ si + 1 }}
                    </span>
                    <span class="text-muted">{{ step }}</span>
                  </li>
                </ol>
              </div>

              <UButton
                label="Get Full AI Action Plan"
                icon="i-lucide-sparkles"
                color="primary"
                variant="soft"
                size="sm"
                @click="openRecommendationPlan(rec)"
              />
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <ActionPlanSlideover
    v-model:open="actionPlanOpen"
    :item="actionPlanItem"
  />
</template>
