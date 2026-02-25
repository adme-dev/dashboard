<script setup lang="ts">
import { format } from 'date-fns'
import type { AiAgentReport, AiAgentReportSection } from '~/types'

definePageMeta({ layout: 'agency' })

const route = useRoute()
const { fetchReport, markReportRead } = useAiAgent()

const report = ref<AiAgentReport | null>(null)
const loading = ref(true)

const reportId = computed(() => route.params.id as string)

const reportTypeColors: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  daily_digest: 'primary',
  weekly_report: 'success',
  anomaly_scan: 'warning',
  manual: 'info',
}

const severityColors: Record<string, string> = {
  info: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800',
  warning: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800',
  critical: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800',
}

const severityIcons: Record<string, string> = {
  info: 'i-lucide-info',
  warning: 'i-lucide-alert-triangle',
  critical: 'i-lucide-alert-circle',
}

function reportTypeLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr), 'PPpp')
  } catch {
    return dateStr
  }
}

// Render markdown-like content to safe HTML
// Handles: **bold**, *italic*, `code`, headers, links, lists, line breaks
function renderContent(text: string): string {
  if (!text) return ''
  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold mt-4 mb-2">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-lg mt-4 mb-2">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold text-xl mt-4 mb-2">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-[var(--ui-bg-elevated)] text-sm">$1</code>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^• (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Internal links (paths like /agency/tasks/xxx)
    .replace(/\b(\/agency\/[^\s<]+)/g, '<a href="$1" class="text-[var(--ui-color-primary)] hover:underline">$1</a>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br>')

  return `<p>${html}</p>`
}

// Build accordion items from sections
const accordionItems = computed(() => {
  if (!report.value?.sections?.length) return []
  return report.value.sections.map((section: AiAgentReportSection, idx: number) => ({
    label: section.title,
    icon: section.severity ? severityIcons[section.severity] || 'i-lucide-file-text' : 'i-lucide-file-text',
    value: `section-${idx}`,
    content: section.content,
    severity: section.severity,
    type: section.type,
  }))
})

// Feedback
const feedbackGiven = ref<'helpful' | 'not-helpful' | null>(null)

function giveFeedback(type: 'helpful' | 'not-helpful') {
  feedbackGiven.value = type
}

onMounted(async () => {
  loading.value = true
  const data = await fetchReport(reportId.value)
  if (data) {
    report.value = data
    if (!data.isRead) {
      markReportRead(data.id)
    }
  }
  loading.value = false
})
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar>
        <template #left>
          <UButton
            to="/agency/ai/reports"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-left"
            label="Reports"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="loading" class="max-w-3xl mx-auto space-y-4">
          <USkeleton class="h-8 w-64 rounded" />
          <USkeleton class="h-5 w-48 rounded" />
          <USkeleton class="h-48 w-full rounded" />
        </div>

        <!-- Not found -->
        <div v-else-if="!report" class="text-center py-16">
          <UIcon name="i-lucide-file-x" class="w-12 h-12 text-[var(--ui-text-dimmed)] mx-auto mb-3" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)] mb-1">Report not found</h3>
          <p class="text-sm text-[var(--ui-text-muted)]">
            This report may have been deleted or you don't have access.
          </p>
          <UButton to="/agency/ai/reports" variant="soft" class="mt-4" label="Back to reports" />
        </div>

        <!-- Report content -->
        <div v-else class="max-w-3xl mx-auto">
          <!-- Title + metadata -->
          <div class="mb-6">
            <h1 class="text-2xl font-bold text-[var(--ui-text-highlighted)]">
              {{ report.title }}
            </h1>
            <div class="flex items-center gap-3 mt-2">
              <UBadge
                :color="reportTypeColors[report.reportType] || 'neutral'"
                variant="subtle"
              >
                {{ reportTypeLabel(report.reportType) }}
              </UBadge>
              <span class="text-sm text-[var(--ui-text-muted)]">
                {{ formatDate(report.createdAt) }}
              </span>
            </div>
          </div>

          <!-- Main content -->
          <UCard v-if="report.content" class="mb-6">
            <div
              class="prose dark:prose-invert max-w-none text-sm leading-relaxed"
              v-html="renderContent(report.content)"
            />
          </UCard>

          <!-- Sections as accordion -->
          <div v-if="accordionItems.length" class="space-y-3 mb-6">
            <h2 class="font-semibold text-lg text-[var(--ui-text-highlighted)]">Sections</h2>
            <UAccordion
              :items="accordionItems"
              multiple
              :default-value="accordionItems.map((i: any) => i.value)"
            >
              <template #body="{ item }">
                <div
                  v-if="item.severity"
                  class="mb-3 px-3 py-2 rounded-lg border text-sm"
                  :class="severityColors[item.severity] || ''"
                >
                  <div class="flex items-center gap-2">
                    <UIcon :name="severityIcons[item.severity] || 'i-lucide-info'" class="w-4 h-4 shrink-0" />
                    <span class="font-medium capitalize">{{ item.severity }}</span>
                  </div>
                </div>
                <div
                  class="prose dark:prose-invert max-w-none text-sm leading-relaxed"
                  v-html="renderContent(item.content)"
                />
              </template>
            </UAccordion>
          </div>

          <!-- Feedback section -->
          <UCard class="mt-8">
            <div class="text-center">
              <p class="text-sm text-[var(--ui-text-muted)] mb-3">Was this report helpful?</p>
              <div v-if="!feedbackGiven" class="flex items-center justify-center gap-3">
                <UButton
                  variant="soft"
                  color="success"
                  icon="i-lucide-thumbs-up"
                  label="Helpful"
                  @click="giveFeedback('helpful')"
                />
                <UButton
                  variant="soft"
                  color="neutral"
                  icon="i-lucide-thumbs-down"
                  label="Not helpful"
                  @click="giveFeedback('not-helpful')"
                />
              </div>
              <p v-else class="text-sm text-[var(--ui-text-muted)]">
                <UIcon
                  :name="feedbackGiven === 'helpful' ? 'i-lucide-check-circle' : 'i-lucide-message-circle'"
                  class="w-4 h-4 inline-block mr-1"
                />
                Thanks for your feedback!
              </p>
            </div>
          </UCard>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
