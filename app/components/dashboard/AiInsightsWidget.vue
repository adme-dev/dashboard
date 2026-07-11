<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

type ReportCategory = 'overdue' | 'stale_briefs' | 'blocked' | 'deadline_risks' | 'spend_anomalies' | 'eom' | 'workload' | 'unassigned'
type ReportSeverity = 'info' | 'warning' | 'critical'

interface AiReport {
  id: string
  title: string
  summary?: string
  category?: ReportCategory
  severity?: ReportSeverity
  reportType?: string
  isRead?: boolean
  createdAt: string
  findingsCount?: number
  metadata?: Record<string, unknown>
}

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>

const data = ref<{ reports: AiReport[] } | AiReport[] | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshAiInsights() {
  status.value = 'pending'
  try {
    data.value = await apiFetch<{ reports: AiReport[] } | AiReport[]>('/api/agency/ai/agent/reports', {
      query: { limit: 5 },
    })
    status.value = 'success'
  } catch (error) {
    console.error('Failed to load AI insights', error)
    status.value = 'error'
  }
}

await refreshAiInsights()

const reports = computed<AiReport[]>(() => {
  if (!data.value) return []
  // Handle both { reports: [...] } and flat array responses
  const raw = Array.isArray(data.value) ? data.value : (data.value as any).reports || []
  return raw.slice(0, 5)
})

function resolveCategory(report: AiReport): ReportCategory {
  if (report.category) return report.category
  // Derive category from reportType if category not present
  const type = (report.reportType || '').toLowerCase()
  if (type.includes('overdue')) return 'overdue'
  if (type.includes('brief') || type.includes('stale')) return 'stale_briefs'
  if (type.includes('block')) return 'blocked'
  if (type.includes('deadline') || type.includes('risk')) return 'deadline_risks'
  if (type.includes('spend') || type.includes('anomal')) return 'spend_anomalies'
  if (type.includes('eom') || type.includes('invoice')) return 'eom'
  if (type.includes('workload') || type.includes('capacity')) return 'workload'
  if (type.includes('unassign')) return 'unassigned'
  return 'workload'
}

function resolveSeverity(report: AiReport): ReportSeverity {
  if (report.severity) return report.severity
  const count = report.findingsCount ?? 0
  if (count >= 5) return 'critical'
  if (count >= 2) return 'warning'
  return 'info'
}

const severityConfig: Record<ReportSeverity, { icon: string; color: string; bgClass: string }> = {
  info: {
    icon: 'i-lucide-info',
    color: 'text-blue-500',
    bgClass: 'bg-blue-100 dark:bg-blue-500/10',
  },
  warning: {
    icon: 'i-lucide-alert-triangle',
    color: 'text-amber-500',
    bgClass: 'bg-amber-100 dark:bg-amber-500/10',
  },
  critical: {
    icon: 'i-lucide-alert-circle',
    color: 'text-red-500',
    bgClass: 'bg-red-100 dark:bg-red-500/10',
  },
}

const categoryConfig: Record<ReportCategory, { label: string; color: string }> = {
  overdue: { label: 'Overdue', color: 'error' },
  stale_briefs: { label: 'Stale Briefs', color: 'warning' },
  blocked: { label: 'Blocked', color: 'error' },
  deadline_risks: { label: 'Deadline Risks', color: 'warning' },
  spend_anomalies: { label: 'Spend Anomalies', color: 'neutral' },
  eom: { label: 'EOM', color: 'info' },
  workload: { label: 'Workload', color: 'info' },
  unassigned: { label: 'Unassigned', color: 'neutral' },
}

function relativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

const badges = computed(() => {
  const unread = reports.value.filter(r => r.isRead === false).length
  return unread ? [{ label: `${unread} unread`, color: 'info' as const }] : []
})
</script>

<template>
  <DashboardWidgetShell
    title="AI Insights"
    icon="i-lucide-brain"
    :badges="badges"
    to="/agency/ai/chat"
    :loading="status === 'pending'"
    :is-empty="!reports.length"
    empty-text="No AI insights yet"
    empty-icon="i-lucide-sparkles"
  >
    <div class="space-y-1">
      <NuxtLink
        v-for="report in reports"
        :key="report.id"
        :to="`/agency/ai/reports/${report.id}`"
        class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-[var(--ui-bg-elevated)] transition-colors"
      >
        <!-- Severity icon -->
        <div
          class="shrink-0 p-1.5 rounded-full mt-0.5"
          :class="severityConfig[resolveSeverity(report)].bgClass"
        >
          <UIcon
            :name="severityConfig[resolveSeverity(report)].icon"
            class="w-3.5 h-3.5"
            :class="severityConfig[resolveSeverity(report)].color"
          />
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <p class="text-sm font-medium text-[var(--ui-text-highlighted)] truncate">
              {{ report.title }}
            </p>
          </div>
          <p
            v-if="report.summary"
            class="text-xs text-[var(--ui-text-muted)] mt-0.5 line-clamp-2"
          >
            {{ report.summary }}
          </p>
          <div class="flex items-center gap-2 mt-1">
            <UBadge
              :color="(categoryConfig[resolveCategory(report)]?.color as any) || 'neutral'"
              variant="subtle"
              size="xs"
            >
              {{ categoryConfig[resolveCategory(report)]?.label || resolveCategory(report) }}
            </UBadge>
            <span class="text-[11px] text-[var(--ui-text-dimmed)]">
              {{ relativeTime(report.createdAt) }}
            </span>
          </div>
        </div>

        <!-- Unread dot -->
        <div
          v-if="report.isRead === false"
          class="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2"
        />
      </NuxtLink>
    </div>
  </DashboardWidgetShell>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
