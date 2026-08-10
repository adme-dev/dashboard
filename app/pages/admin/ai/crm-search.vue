<script setup lang="ts">
import type {
  CrmSearchApprovalView,
  CrmSearchDeadLetterView,
  CrmSearchHealthView,
  CrmSearchPolicyView,
  CrmSearchTelemetryView
} from '~/types/crmSearchOperations'

definePageMeta({ layout: 'agency', middleware: ['role-admin'] })
useHead({ title: 'CRM Search Operations' })

const endpoints = {
  health: '/api/admin/crm-search/health', policies: '/api/admin/crm-search/policies',
  globalControl: '/api/admin/crm-search/global-control', backfills: '/api/admin/crm-search/backfills',
  reconcile: '/api/admin/crm-search/reconcile', deadLetters: '/api/admin/crm-search/dead-letters',
  approvals: '/api/admin/crm-search/approvals', approvalImport: '/api/admin/crm-search/approvals/import',
  telemetry: '/api/admin/crm-search/telemetry'
} as const

const { data: health, status: healthStatus, error: healthError, refresh: refreshHealth } = await useFetch<CrmSearchHealthView>(endpoints.health, { default: () => null })
const { data: policies, status: policiesStatus, error: policiesError, refresh: refreshPolicies } = await useFetch<CrmSearchPolicyView[]>(endpoints.policies, { default: () => [] })
const { data: deadLetters, status: deadLettersStatus, error: deadLettersError, refresh: refreshDeadLetters } = await useFetch<CrmSearchDeadLetterView[]>(endpoints.deadLetters, { default: () => [] })
const { data: approvals, status: approvalsStatus, error: approvalsError, refresh: refreshApprovals } = await useFetch<CrmSearchApprovalView[]>(endpoints.approvals, { default: () => [] })
const { data: telemetry, status: telemetryStatus, error: telemetryError, refresh: refreshTelemetry } = await useFetch<CrmSearchTelemetryView[]>(endpoints.telemetry, { default: () => [] })
const globalOpen = ref(false); const policyOpen = ref(false); const deadLetterOpen = ref(false)
const approvalCreateOpen = ref(false); const approvalImportOpen = ref(false); const approvalRevokeOpen = ref(false)
const selectedPolicy = ref<CrmSearchPolicyView | null>(null)
const selectedDeadLetter = ref<CrmSearchDeadLetterView | null>(null)
const selectedApproval = ref<CrmSearchApprovalView | null>(null)
const pending = computed(() => ({
  health: healthStatus.value === 'pending', policies: policiesStatus.value === 'pending',
  deadLetters: deadLettersStatus.value === 'pending', approvals: approvalsStatus.value === 'pending',
  telemetry: telemetryStatus.value === 'pending'
}))
const allPending = computed(() => Object.values(pending.value).some(Boolean))

function message(caught: unknown, fallback: string) {
  return (caught as { data?: { statusMessage?: string } })?.data?.statusMessage ?? fallback
}

const errors = computed(() => ({
  health: healthError.value ? message(healthError.value, 'Search health could not be loaded.') : null,
  policies: policiesError.value ? message(policiesError.value, 'Client policies could not be loaded.') : null,
  deadLetters: deadLettersError.value ? message(deadLettersError.value, 'Dead-letter work could not be loaded.') : null,
  approvals: approvalsError.value ? message(approvalsError.value, 'Approval ledger could not be loaded.') : null,
  telemetry: telemetryError.value ? message(telemetryError.value, 'Search telemetry could not be loaded.') : null
}))

async function loadHealth() { await refreshHealth() }
async function loadPolicies() { await refreshPolicies() }
async function loadDeadLetters() { await refreshDeadLetters() }
async function loadApprovals() { await refreshApprovals() }
async function loadTelemetry() { await refreshTelemetry() }
async function refreshAll() { await Promise.all([loadHealth(), loadPolicies(), loadDeadLetters(), loadApprovals(), loadTelemetry()]) }
function managePolicy(policy: CrmSearchPolicyView) { selectedPolicy.value = policy; policyOpen.value = true }
function resolveDeadLetter(item: CrmSearchDeadLetterView) { selectedDeadLetter.value = item; deadLetterOpen.value = true }
function revokeApproval(item: CrmSearchApprovalView) { selectedApproval.value = item; approvalRevokeOpen.value = true }
function openGlobalControl() { globalOpen.value = true }
function openApprovalCreate() { approvalCreateOpen.value = true }
function openApprovalImport() { approvalImportOpen.value = true }

</script>

<template>
  <main class="mx-auto h-full min-h-0 max-w-7xl space-y-6 overflow-y-auto p-4 sm:p-6" aria-labelledby="crm-search-operations-title">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div class="mb-2 flex items-center gap-2 text-xs text-muted"><span>Admin</span><UIcon name="i-lucide-chevron-right" class="size-3" /><span>AI</span></div><h1 id="crm-search-operations-title" class="text-xl font-semibold text-highlighted">CRM search operations</h1><p class="mt-1 max-w-3xl text-sm text-muted">Review health, policies, evaluation evidence, immutable approvals, durable recovery work, and bounded telemetry. This console never calls providers or deploys code.</p></div>
      <div class="flex flex-wrap gap-2"><UButton color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="allPending" @click="refreshAll">Refresh all</UButton><UButton color="neutral" variant="soft" icon="i-lucide-shield-plus" @click="openApprovalImport">Import bootstrap</UButton><UButton icon="i-lucide-badge-plus" @click="openApprovalCreate">Create approval</UButton></div>
    </header>

    <UAlert color="info" variant="soft" icon="i-lucide-shield-check" title="Audited control plane" description="Fresh ADMIN authority, expected revisions, typed confirmations, independent approvals, and append-only audit records are required for every production command." />
    <AiCrmSearchSearchHealthSummary :health="health" :pending="pending.health" :error="errors.health" @refresh="loadHealth" />
    <div class="flex justify-end"><UButton color="warning" variant="soft" icon="i-lucide-power" :disabled="!health" @click="openGlobalControl">Manage global control</UButton></div>
    <UCard><AiCrmSearchClientPolicyTable :policies="policies" :pending="pending.policies" :error="errors.policies" @transition="managePolicy" @refresh="loadPolicies" /></UCard>
    <AiCrmSearchEvaluationEvidencePanel :evaluation-run-id="selectedPolicy?.evaluationRunId ?? null" :pending="pending.policies" />
    <UCard><AiCrmSearchDeadLetterTable :dead-letters="deadLetters" :pending="pending.deadLetters" :error="errors.deadLetters" @resolve="resolveDeadLetter" @refresh="loadDeadLetters" /></UCard>
    <UCard><AiCrmSearchApprovalLedger :approvals="approvals" :pending="pending.approvals" :error="errors.approvals" @revoke="revokeApproval" @refresh="loadApprovals" /></UCard>
    <UCard><AiCrmSearchSearchTelemetryPanel :telemetry="telemetry" :pending="pending.telemetry" :error="errors.telemetry" @refresh="loadTelemetry" /></UCard>

    <AiCrmSearchGlobalControlDialog v-model:open="globalOpen" :health="health" @changed="refreshAll" @refresh="loadHealth" />
    <AiCrmSearchPolicyTransitionDialog v-model:open="policyOpen" :policy="selectedPolicy" @changed="refreshAll" @refresh="loadPolicies" />
    <AiCrmSearchDeadLetterResolutionDialog v-model:open="deadLetterOpen" :item="selectedDeadLetter" @changed="refreshAll" @refresh="loadDeadLetters" />
    <AiCrmSearchApprovalCreateDialog v-model:open="approvalCreateOpen" @changed="loadApprovals" />
    <AiCrmSearchApprovalImportDialog v-model:open="approvalImportOpen" @changed="loadApprovals" />
    <AiCrmSearchApprovalRevokeDialog v-model:open="approvalRevokeOpen" :approval="selectedApproval" @changed="loadApprovals" @refresh="loadApprovals" />
  </main>
</template>
