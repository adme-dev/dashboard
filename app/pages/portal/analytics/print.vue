<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { buildPortalAnalyticsPrintUrl, normalizePortalAnalyticsPrintFilters } from '~/utils/portalAnalyticsPrint'

definePageMeta({ layout: false, middleware: 'portal-auth' })

const route = useRoute()
const { user } = usePortalAuth()
const filters = computed(() => normalizePortalAnalyticsPrintFilters(
  route.query as Record<string, string | string[] | null | undefined>
))
const { report, status, error, ready, refresh } = usePortalAnalyticsPrintReport(filters)
const renderedReady = ref(false)
const printing = ref(false)
const canPrint = computed(() => ready.value && renderedReady.value && !printing.value)
const clientName = computed(() => user.value?.clientName || 'Client')

const analyticsUrl = computed(() => buildPortalAnalyticsPrintUrl(filters.value)
  .replace('/portal/analytics/print?', '/portal/analytics?'))

useHead(() => ({
  title: `${clientName.value} — Ad Performance — ${filters.value.startDate} to ${filters.value.endDate}`,
  meta: [{ name: 'robots', content: 'noindex, nofollow' }]
}))

function animationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

async function waitForReportRendering() {
  renderedReady.value = false
  await nextTick()
  if (document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, 3000))
    ])
  }
  await animationFrame()
  await animationFrame()
  renderedReady.value = true
}

async function refreshReport() {
  renderedReady.value = false
  await refresh()
}

function printReport() {
  if (!canPrint.value) return
  printing.value = true
  window.print()
  printing.value = false
}

watch(report, (value) => {
  if (value) void waitForReportRendering()
}, { flush: 'post' })

watch(filters, () => {
  void refreshReport()
}, { deep: true })

onMounted(() => {
  void refreshReport()
})
</script>

<template>
  <div class="analytics-print-page">
    <div class="analytics-print-toolbar print:hidden">
      <div>
        <p class="text-sm font-semibold text-default">
          PDF report preview
        </p>
        <p class="text-xs text-muted">
          A4 portrait · {{ filters.startDate }} to {{ filters.endDate }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          :to="analyticsUrl"
          icon="i-lucide-arrow-left"
          label="Back to analytics"
          color="neutral"
          variant="outline"
        />
        <UButton
          icon="i-lucide-printer"
          :label="canPrint ? 'Print / Save PDF' : 'Preparing report…'"
          :disabled="!canPrint"
          :loading="status === 'pending' || (ready && !renderedReady)"
          @click="printReport"
        />
      </div>
    </div>

    <main v-if="status === 'pending' || status === 'idle'" class="analytics-print-state print:hidden">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
      <div>
        <h1 class="text-lg font-semibold text-default">
          Preparing your analytics report
        </h1>
        <p class="mt-1 text-sm text-muted">
          Loading campaigns, outcomes, website activity, and audience signals.
        </p>
      </div>
    </main>

    <main v-else-if="status === 'error' || error" class="analytics-print-state print:hidden">
      <UAlert
        color="error"
        icon="i-lucide-circle-alert"
        title="The PDF report could not be prepared"
        description="The core advertising data is temporarily unavailable. Retry the report or return to analytics."
      />
      <div class="flex gap-2">
        <UButton label="Retry" icon="i-lucide-refresh-cw" @click="refreshReport" />
        <UButton
          :to="analyticsUrl"
          label="Back to analytics"
          color="neutral"
          variant="outline"
        />
      </div>
    </main>

    <AnalyticsPortalAnalyticsPrintReport
      v-else-if="report"
      :report="report"
      :client-name="clientName"
      :client-logo="user?.clientLogo"
    />
  </div>
</template>

<style>
.analytics-print-page {
  min-height: 100vh;
  padding: 24px;
  background: #eef1f5;
  color-scheme: light;
}

.analytics-print-toolbar {
  position: sticky;
  z-index: 10;
  top: 16px;
  display: flex;
  width: min(100%, 980px);
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  margin: 0 auto 24px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-bg);
  box-shadow: 0 12px 30px rgb(15 23 42 / 12%);
}

.analytics-print-state {
  display: flex;
  width: min(100%, 760px);
  min-height: 280px;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px;
  margin: 48px auto;
  border: 1px solid var(--ui-border);
  border-radius: 16px;
  background: var(--ui-bg);
}

@media print {
  .analytics-print-page {
    min-height: 0;
    padding: 0;
    background: #fff;
  }
}
</style>
