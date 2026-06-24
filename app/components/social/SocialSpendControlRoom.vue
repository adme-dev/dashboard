<script setup lang="ts">
type ControlStatus = 'healthy' | 'warning' | 'critical'

interface SpendControlIssue {
  id: string
  type: string
  severity: 'warning' | 'critical'
  title: string
  detail: string
  action: string
  platform: string
  accountName: string | null
  spend?: number
}

const props = defineProps<{
  diagnostics: {
    overallStatus: ControlStatus
    summary: {
      connectedAccounts: number
      mappedConnections: number
      duplicateConnectionGroups: number
      unmappedSpendGroups: number
      staleConnections: number
      expiredConnections: number
      disconnectedConnections: number
      issueCount: number
    }
    issues: SpendControlIssue[]
  } | null
  diagnosticsLoading?: boolean
  pacingSummary?: {
    criticalCount?: number
    warningCount?: number
    infoCount?: number
    staleCount?: number
    projectedOverspend?: number
    projectedUnderspend?: number
  } | null
  bankDiscrepancy?: { diff: number, pct: number } | null
  hasBankData?: boolean
  liveBudgetChangesEnabled?: boolean
}>()

const topIssues = computed(() => props.diagnostics?.issues?.slice(0, 4) ?? [])
const pacingIssueCount = computed(() =>
  (props.pacingSummary?.criticalCount ?? 0) + (props.pacingSummary?.warningCount ?? 0)
)
const bankMismatch = computed(() =>
  Boolean(props.hasBankData && props.bankDiscrepancy && Math.abs(props.bankDiscrepancy.pct) > 2)
)
const bankDiscrepancyText = computed(() => {
  if (!props.bankDiscrepancy) return 'No bank comparison yet'
  const sign = props.bankDiscrepancy.diff > 0 ? '+' : ''
  return `${sign}${formatCurrency(props.bankDiscrepancy.diff)} (${sign}${props.bankDiscrepancy.pct}%)`
})

const overallTone = computed(() => {
  if (props.diagnosticsLoading) return { color: 'neutral' as const, icon: 'i-lucide-loader-2', label: 'Checking' }
  if (!props.diagnostics) return { color: 'neutral' as const, icon: 'i-lucide-shield-question', label: 'Not checked' }
  if (props.diagnostics.overallStatus === 'critical') return { color: 'error' as const, icon: 'i-lucide-alert-triangle', label: 'Needs review' }
  if (props.diagnostics.overallStatus === 'warning') return { color: 'warning' as const, icon: 'i-lucide-circle-alert', label: 'Watch' }
  return { color: 'success' as const, icon: 'i-lucide-shield-check', label: 'Controlled' }
})

const cards = computed(() => [
  {
    label: 'Account control',
    value: props.diagnostics
      ? `${props.diagnostics.summary.mappedConnections}/${props.diagnostics.summary.connectedAccounts}`
      : '-',
    detail: props.diagnostics
      ? `${props.diagnostics.summary.duplicateConnectionGroups} duplicate / ${props.diagnostics.summary.unmappedSpendGroups} unmapped`
      : 'Waiting for diagnostics',
    icon: 'i-lucide-plug-zap',
    color: props.diagnostics?.summary.duplicateConnectionGroups || props.diagnostics?.summary.unmappedSpendGroups
      ? 'error'
      : 'success'
  },
  {
    label: 'Pacing queue',
    value: String(pacingIssueCount.value),
    detail: `${props.pacingSummary?.criticalCount ?? 0} critical / ${props.pacingSummary?.warningCount ?? 0} warning`,
    icon: 'i-lucide-gauge',
    color: (props.pacingSummary?.criticalCount ?? 0) > 0 ? 'error' : pacingIssueCount.value > 0 ? 'warning' : 'success'
  },
  {
    label: 'Accounting truth',
    value: props.hasBankData ? bankDiscrepancyText.value : 'No Xero match',
    detail: props.hasBankData ? 'Bank/Xero vs platform spend' : 'Connect Xero to reconcile charges',
    icon: 'i-lucide-landmark',
    color: bankMismatch.value ? 'warning' : props.hasBankData ? 'success' : 'neutral'
  },
  {
    label: 'Write safety',
    value: props.liveBudgetChangesEnabled ? 'Armed' : 'Review only',
    detail: props.liveBudgetChangesEnabled ? 'Approval still required before platform write' : 'Recommendations stay in queue',
    icon: props.liveBudgetChangesEnabled ? 'i-lucide-zap' : 'i-lucide-shield-check',
    color: props.liveBudgetChangesEnabled ? 'warning' : 'success'
  }
])

function issueColor(severity: string) {
  return severity === 'critical' ? 'error' : 'warning'
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(val)
}
</script>

<template>
  <section class="rounded-xl border border-default overflow-hidden">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-default bg-elevated/30">
      <div class="flex items-center gap-3">
        <div class="rounded-lg bg-default p-2">
          <UIcon
            :name="overallTone.icon"
            class="size-5"
            :class="[
              overallTone.color === 'error' ? 'text-error' : '',
              overallTone.color === 'warning' ? 'text-warning' : '',
              overallTone.color === 'success' ? 'text-success' : '',
              diagnosticsLoading ? 'animate-spin text-muted' : ''
            ]"
          />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold">
              Spend control room
            </h2>
            <UBadge :color="overallTone.color" variant="soft" size="xs">
              {{ overallTone.label }}
            </UBadge>
          </div>
          <p class="text-xs text-muted mt-0.5">
            Account integrity, pacing, reconciliation, and write safety in one review surface.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          to="/agency/social/publishing/accounts"
          variant="ghost"
          size="xs"
          icon="i-lucide-share-2"
        >
          Publishing accounts
        </UButton>
        <UButton
          to="/agency/social"
          variant="ghost"
          size="xs"
          icon="i-lucide-plug"
        >
          Ad connections
        </UButton>
      </div>
    </div>

    <div class="grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-default">
      <div v-for="card in cards" :key="card.label" class="p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[11px] font-medium text-muted uppercase tracking-wide">
              {{ card.label }}
            </p>
            <p class="mt-1 text-lg font-semibold truncate">
              {{ card.value }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ card.detail }}
            </p>
          </div>
          <UIcon
            :name="card.icon"
            class="size-4 shrink-0"
            :class="[
              card.color === 'error' ? 'text-error' : '',
              card.color === 'warning' ? 'text-warning' : '',
              card.color === 'success' ? 'text-success' : '',
              card.color === 'neutral' ? 'text-muted' : ''
            ]"
          />
        </div>
      </div>
    </div>

    <div v-if="topIssues.length" class="border-t border-default px-4 py-3 bg-default/30">
      <div class="flex flex-col gap-2">
        <div v-for="issue in topIssues" :key="issue.id" class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="issueColor(issue.severity)" variant="subtle" size="xs">
                {{ issue.severity }}
              </UBadge>
              <span class="text-sm font-medium">{{ issue.title }}</span>
              <span class="text-xs text-muted">{{ issue.platform }}</span>
              <span v-if="issue.spend" class="text-xs text-muted">{{ formatCurrency(issue.spend) }}</span>
            </div>
            <p class="text-xs text-muted mt-0.5">
              {{ issue.detail }}
            </p>
          </div>
          <p class="text-xs text-muted sm:text-right sm:max-w-sm">
            {{ issue.action }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
