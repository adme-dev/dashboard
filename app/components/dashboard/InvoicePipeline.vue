<script setup lang="ts">
interface PipelineStage {
  name: string
  count: number
  value: number
  percentage: number
  color: string
  averageDaysInStage: number
}

interface PipelineData {
  summary: {
    totalInvoices: number
    totalValue: number
    paidValue: number
    outstandingValue: number
    paidRate: number
    overdueRate: number
    averageCollectionTime: number
    riskLevel: 'low' | 'medium' | 'high'
  }
  stages: {
    draft: PipelineStage
    submitted: PipelineStage
    authorised: PipelineStage
    overdue: PipelineStage
    paid: PipelineStage
  }
  bottlenecks: Array<{
    stage: string
    issue: string
    count?: number
    days?: number
    rate?: number
  }>
  recommendations: string[]
}

const props = defineProps<{
  data: PipelineData | null
  loading: boolean
}>()

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

const getRiskColor = (riskLevel: string) => {
  switch (riskLevel) {
    case 'high': return 'text-red-500'
    case 'medium': return 'text-amber-500'
    case 'low': return 'text-emerald-500'
    default: return 'text-neutral-500'
  }
}

const getRiskIcon = (riskLevel: string) => {
  switch (riskLevel) {
    case 'high': return 'i-lucide-alert-triangle'
    case 'medium': return 'i-lucide-alert-circle'
    case 'low': return 'i-lucide-shield-check'
    default: return 'i-lucide-help-circle'
  }
}

// Pipeline stages in order
const stageOrder = ['draft', 'submitted', 'authorised', 'overdue', 'paid'] as const

const pipelineStages = computed(() => {
  if (!props.data?.stages) return []
  
  return stageOrder.map(key => ({
    key,
    ...props.data!.stages[key]
  }))
})

// Calculate stage widths for visualization
const stageWidths = computed(() => {
  const total = props.data?.summary.totalValue || 1
  return pipelineStages.value.map(stage => ({
    ...stage,
    widthPercent: Math.max((stage.value / total) * 100, 2) // Minimum 2% for visibility
  }))
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">Invoice Pipeline</h3>
          <p class="text-sm text-muted">Revenue collection status</p>
        </div>
        
        <div class="flex items-center gap-3">
          <div v-if="!loading && data" class="text-right">
            <div class="flex items-center gap-2">
              <UIcon :name="getRiskIcon(data.summary.riskLevel)" :class="getRiskColor(data.summary.riskLevel)" class="h-4 w-4" />
              <span class="text-sm font-medium" :class="getRiskColor(data.summary.riskLevel)">
                {{ data.summary.riskLevel.toUpperCase() }} RISK
              </span>
            </div>
            <div class="text-xs text-muted">
              {{ data.summary.averageCollectionTime }}d avg collection
            </div>
          </div>
          
          <UButton
            icon="i-lucide-external-link"
            color="neutral"
            variant="ghost"
            size="sm"
            to="/invoices"
          />
        </div>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="space-y-4">
      <div class="grid grid-cols-3 gap-4">
        <USkeleton class="h-16" v-for="i in 3" :key="i" />
      </div>
      <USkeleton class="h-8 w-full" />
      <USkeleton class="h-24 w-full" />
    </div>

    <!-- Content -->
    <div v-else-if="data" class="space-y-6">
      <!-- Summary Metrics -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="text-center p-4 bg-muted/30 rounded-lg">
          <div class="text-2xl font-bold text-highlighted">
            {{ formatCurrency(data.summary.totalValue) }}
          </div>
          <div class="text-xs text-muted">Total Pipeline</div>
        </div>
        
        <div class="text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
          <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {{ data.summary.paidRate.toFixed(1) }}%
          </div>
          <div class="text-xs text-muted">Collection Rate</div>
        </div>
        
        <div class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div class="text-2xl font-bold text-red-600 dark:text-red-400">
            {{ data.summary.overdueRate.toFixed(1) }}%
          </div>
          <div class="text-xs text-muted">Overdue Rate</div>
        </div>
      </div>

      <!-- Pipeline Visualization -->
      <div class="space-y-3">
        <h4 class="text-sm font-medium text-highlighted">Pipeline Flow</h4>
        
        <!-- Pipeline Bar -->
        <div class="relative h-12 bg-border/30 rounded-lg overflow-hidden">
          <div class="flex h-full">
            <div
              v-for="stage in stageWidths"
              :key="stage.key"
              class="flex items-center justify-center text-white text-xs font-medium transition-all duration-300 hover:opacity-80"
              :style="{
                width: `${stage.widthPercent}%`,
                backgroundColor: stage.color
              }"
            >
              <span v-if="stage.widthPercent > 10" class="truncate px-2">
                {{ stage.name }}
              </span>
            </div>
          </div>
        </div>

        <!-- Stage Details -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div
            v-for="stage in pipelineStages"
            :key="stage.key"
            class="p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors"
          >
            <div class="flex items-center gap-2 mb-2">
              <div
                class="w-3 h-3 rounded-full"
                :style="{ backgroundColor: stage.color }"
              />
              <span class="font-medium text-highlighted">{{ stage.name }}</span>
            </div>
            
            <div class="space-y-1">
              <div class="flex justify-between">
                <span class="text-muted">Count:</span>
                <span class="font-medium">{{ stage.count }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Value:</span>
                <span class="font-medium">{{ formatCurrency(stage.value) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Avg Days:</span>
                <span class="font-medium">{{ stage.averageDaysInStage }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottlenecks -->
      <div v-if="data.bottlenecks.length > 0" class="space-y-3">
        <h4 class="text-sm font-medium text-highlighted">Pipeline Bottlenecks</h4>
        <div class="space-y-2">
          <UAlert
            v-for="bottleneck in data.bottlenecks"
            :key="bottleneck.stage"
            icon="i-lucide-alert-triangle"
            color="amber"
            variant="subtle"
            :title="bottleneck.stage.charAt(0).toUpperCase() + bottleneck.stage.slice(1)"
            :description="bottleneck.issue"
            class="text-sm"
          />
        </div>
      </div>

      <!-- Recommendations -->
      <div v-if="data.recommendations.length > 0" class="space-y-3">
        <h4 class="text-sm font-medium text-highlighted">Recommendations</h4>
        <div class="space-y-2">
          <div
            v-for="recommendation in data.recommendations"
            :key="recommendation"
            class="flex items-start gap-2 text-sm text-muted"
          >
            <UIcon name="i-lucide-lightbulb" class="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            {{ recommendation }}
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="flex gap-2 pt-4 border-t border-border">
        <UButton
          size="sm"
          color="neutral"
          variant="subtle"
          to="/invoices?status=draft"
        >
          Review Drafts ({{ data.stages.draft.count }})
        </UButton>
        
        <UButton
          size="sm"
          color="neutral"
          variant="subtle"
          to="/invoices?status=overdue"
        >
          Collect Overdue ({{ data.stages.overdue.count }})
        </UButton>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex items-center justify-center py-12">
      <div class="text-center">
        <UIcon name="i-lucide-file-text" class="h-12 w-12 text-muted/50 mx-auto mb-4" />
        <p class="text-muted">No invoice data available</p>
        <p class="text-sm text-muted/70">Connect to Xero to see your invoice pipeline</p>
      </div>
    </div>
  </UCard>
</template>

<style scoped>
/* Add smooth transitions for pipeline visualization */
.pipeline-stage {
  transition: all 0.3s ease;
}

.pipeline-stage:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>
