<script setup lang="ts">
import { CalendarDate, getLocalTimeZone } from '@internationalized/date'
import { CRM_SEARCH_CHANGE_APPROVAL_TYPES, type CrmSearchChangeApprovalType } from '~/types/crmSearchOperations'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean], changed: [] }>()
const toast = useToast()
const model = computed({ get: () => props.open, set: value => emit('update:open', value) })
const pending = ref(false); const error = ref<string | null>(null)
const organisationScopeId = 'Resolved server-side from fresh ADMIN authority'
const approvedBy = 'Current fresh ADMIN actor'
const future = new Date(Date.now() + 7 * 86_400_000)
const expiresDate = shallowRef(new CalendarDate(future.getFullYear(), future.getMonth() + 1, future.getDate()))
const form = reactive({
  approvalType: 'resource_provision' as CrmSearchChangeApprovalType, environment: 'production', clientId: '',
  implementationGitSha: '', artifactManifestDigest: '', pagesBundleDigest: '', workerBundleDigest: '',
  bindingManifestDigest: '', evidenceBundleHash: '', loadProtocolDigest: '', providerContractDigest: '',
  rateCardId: '', maximumCostUsdMicros: 0, requestedByActorId: '', expectedControlRevision: 0,
  expectedPolicyRevision: 0, expectedDeploymentApprovalId: '', targetSchemaVersion: 'crm-search-v1',
  requestedAction: 'enable_indexing', activeVectorCount: 0, candidateVectorCount: 0,
  retiringVectorCount: 0, sentinelVectorCount: 0, deletionPendingVectorCount: 0,
  forecastVectorCount: 0, vectorCapacity: 1, activeNamespaceCount: 0, candidateNamespaceCount: 0,
  retiringNamespaceCount: 0, sentinelNamespaceCount: 0, deletionPendingNamespaceCount: 0,
  forecastNamespaceCount: 0, namespaceCapacity: 1, reason: ''
})
const typeOptions = CRM_SEARCH_CHANGE_APPROVAL_TYPES.map(value => ({ label: value.replaceAll('_', ' '), value }))
const environmentOptions = ['preview', 'production'].map(value => ({ label: value, value }))
const actionOptions = ['enable_indexing', 'restore_indexing_readiness', 'policy_indexing', 'configure_candidate', 'promote_candidate', 'retire_schema'].map(value => ({ label: value.replaceAll('_', ' '), value }))
const isClient = computed(() => ['client_indexing', 'client_shadow', 'client_assist'].includes(form.approvalType))
const isIndexing = computed(() => form.approvalType === 'client_indexing')
const requiresDeploymentEvidence = computed(() => form.approvalType === 'production_deploy' || isClient.value)
const expiresAt = computed(() => expiresDate.value.toDate(getLocalTimeZone()).toISOString())
const hasDeploymentEvidence = computed(() => !requiresDeploymentEvidence.value || Boolean(
  form.pagesBundleDigest && form.workerBundleDigest && form.rateCardId
))
const hasClientEvidence = computed(() => !isClient.value || Boolean(
  form.clientId && form.loadProtocolDigest && form.providerContractDigest
  && form.expectedDeploymentApprovalId
))
const hasIndexingCapacity = computed(() => {
  if (!isIndexing.value) return true
  const vectorTotal = form.activeVectorCount + form.candidateVectorCount + form.retiringVectorCount
    + form.sentinelVectorCount + form.deletionPendingVectorCount
  const namespaceTotal = form.activeNamespaceCount + form.candidateNamespaceCount
    + form.retiringNamespaceCount + form.sentinelNamespaceCount + form.deletionPendingNamespaceCount
  return Boolean(form.targetSchemaVersion && form.requestedAction
    && vectorTotal === form.forecastVectorCount && namespaceTotal === form.forecastNamespaceCount
    && form.vectorCapacity > 0 && form.namespaceCapacity > 0
    && form.forecastVectorCount * 5 < form.vectorCapacity * 4
    && form.forecastNamespaceCount * 5 < form.namespaceCapacity * 4)
})
const canSubmit = computed(() => Boolean(
  form.implementationGitSha && form.artifactManifestDigest && form.bindingManifestDigest
  && form.evidenceBundleHash && form.requestedByActorId && form.reason.trim().length >= 10
  && hasDeploymentEvidence.value && hasClientEvidence.value && hasIndexingCapacity.value
  && !pending.value
))
function close() { model.value = false }

async function submit() {
  if (!canSubmit.value) return
  pending.value = true; error.value = null
  try {
    const deployment = requiresDeploymentEvidence.value ? {
      pagesBundleDigest: form.pagesBundleDigest, workerBundleDigest: form.workerBundleDigest,
      rateCardId: form.rateCardId, expectedControlRevision: form.expectedControlRevision
    } : {}
    const client = isClient.value ? {
      clientId: form.clientId, loadProtocolDigest: form.loadProtocolDigest,
      providerContractDigest: form.providerContractDigest,
      expectedPolicyRevision: form.expectedPolicyRevision, expectedDeploymentApprovalId: form.expectedDeploymentApprovalId
    } : {}
    const capacity = isIndexing.value ? {
      targetSchemaVersion: form.targetSchemaVersion, requestedAction: form.requestedAction,
      activeVectorCount: form.activeVectorCount, candidateVectorCount: form.candidateVectorCount,
      retiringVectorCount: form.retiringVectorCount, sentinelVectorCount: form.sentinelVectorCount,
      deletionPendingVectorCount: form.deletionPendingVectorCount, forecastVectorCount: form.forecastVectorCount,
      vectorCapacity: form.vectorCapacity, activeNamespaceCount: form.activeNamespaceCount,
      candidateNamespaceCount: form.candidateNamespaceCount, retiringNamespaceCount: form.retiringNamespaceCount,
      sentinelNamespaceCount: form.sentinelNamespaceCount, deletionPendingNamespaceCount: form.deletionPendingNamespaceCount,
      forecastNamespaceCount: form.forecastNamespaceCount, namespaceCapacity: form.namespaceCapacity
    } : {}
    await $fetch('/api/admin/crm-search/approvals', { method: 'POST', body: {
      approvalType: form.approvalType, environment: form.environment,
      implementationGitSha: form.implementationGitSha, artifactManifestDigest: form.artifactManifestDigest,
      bindingManifestDigest: form.bindingManifestDigest, evidenceBundleHash: form.evidenceBundleHash,
      maximumCostUsdMicros: form.maximumCostUsdMicros, requestedByActorId: form.requestedByActorId,
      reason: form.reason.trim(), expiresAt: expiresAt.value, ...deployment, ...client, ...capacity
    } })
    toast.add({ title: 'Approval recorded', description: 'The immutable approval is now available to exact matching commands.', color: 'success' })
    emit('changed'); model.value = false
  } catch { error.value = 'The approval could not be recorded. Review scope, evidence, capacity, expiry, cost, and actor separation.' }
  finally { pending.value = false }
}
</script>

<template>
  <UModal v-model:open="model" title="Create CRM search approval" description="Record exact production authority; approvals never execute provider or deployment actions.">
    <template #body><div class="@container max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Approval type"><USelectMenu v-model="form.approvalType" :items="typeOptions" value-key="value" class="w-full" /></UFormField>
        <UFormField label="Environment"><USelectMenu v-model="form.environment" :items="environmentOptions" value-key="value" class="w-full" /></UFormField>
        <UFormField label="Organization scope"><UInput :model-value="organisationScopeId" disabled class="w-full" /></UFormField>
        <UFormField label="Approved by"><UInput :model-value="approvedBy" disabled class="w-full" /></UFormField>
        <UFormField v-if="isClient" label="Client ID"><UInput v-model="form.clientId" class="w-full" /></UFormField>
        <UFormField label="Requested by actor ID"><UInput v-model="form.requestedByActorId" class="w-full" /></UFormField>
        <UFormField label="Implementation Git SHA"><UInput v-model="form.implementationGitSha" class="w-full" /></UFormField>
        <UFormField label="Artifact manifest digest"><UInput v-model="form.artifactManifestDigest" class="w-full" /></UFormField>
        <UFormField label="Binding manifest digest"><UInput v-model="form.bindingManifestDigest" class="w-full" /></UFormField>
        <UFormField label="Evidence bundle hash"><UInput v-model="form.evidenceBundleHash" class="w-full" /></UFormField>
        <template v-if="requiresDeploymentEvidence"><UFormField label="Pages bundle digest"><UInput v-model="form.pagesBundleDigest" class="w-full" /></UFormField><UFormField label="Worker bundle digest"><UInput v-model="form.workerBundleDigest" class="w-full" /></UFormField><UFormField label="Rate card ID"><UInput v-model="form.rateCardId" class="w-full" /></UFormField><UFormField label="Expected control revision"><UInput v-model.number="form.expectedControlRevision" type="number" min="0" class="w-full" /></UFormField></template>
        <template v-if="isClient"><UFormField label="Load protocol digest"><UInput v-model="form.loadProtocolDigest" class="w-full" /></UFormField><UFormField label="Provider contract digest"><UInput v-model="form.providerContractDigest" class="w-full" /></UFormField><UFormField label="Deployment approval ID"><UInput v-model="form.expectedDeploymentApprovalId" class="w-full" /></UFormField><UFormField label="Expected policy revision"><UInput v-model.number="form.expectedPolicyRevision" type="number" min="0" class="w-full" /></UFormField></template>
        <template v-if="isIndexing">
          <UFormField label="Target schema"><UInput v-model="form.targetSchemaVersion" class="w-full" /></UFormField>
          <UFormField label="Requested action"><USelectMenu v-model="form.requestedAction" :items="actionOptions" value-key="value" class="w-full" /></UFormField>
          <UFormField label="Active vector count"><UInput v-model.number="form.activeVectorCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Candidate vector count"><UInput v-model.number="form.candidateVectorCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Retiring vector count"><UInput v-model.number="form.retiringVectorCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Sentinel vector count"><UInput v-model.number="form.sentinelVectorCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Deletion-pending vector count"><UInput v-model.number="form.deletionPendingVectorCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Forecast vector count"><UInput v-model.number="form.forecastVectorCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Vector capacity"><UInput v-model.number="form.vectorCapacity" type="number" min="1" class="w-full" /></UFormField>
          <UFormField label="Active namespace count"><UInput v-model.number="form.activeNamespaceCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Candidate namespace count"><UInput v-model.number="form.candidateNamespaceCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Retiring namespace count"><UInput v-model.number="form.retiringNamespaceCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Sentinel namespace count"><UInput v-model.number="form.sentinelNamespaceCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Deletion-pending namespace count"><UInput v-model.number="form.deletionPendingNamespaceCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Forecast namespace count"><UInput v-model.number="form.forecastNamespaceCount" type="number" min="0" class="w-full" /></UFormField>
          <UFormField label="Namespace capacity"><UInput v-model.number="form.namespaceCapacity" type="number" min="1" class="w-full" /></UFormField>
        </template>
        <UFormField label="Maximum cost (USD micros)"><UInput v-model.number="form.maximumCostUsdMicros" type="number" class="w-full" /></UFormField>
        <UFormField label="Expiry"><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start">{{ expiresAt }}</UButton><template #content><div class="p-3"><UCalendar v-model="expiresDate" /></div></template></UPopover></UFormField>
        <UFormField label="Audit reason" class="@lg:col-span-2"><UTextarea v-model="form.reason" :rows="3" class="w-full" /></UFormField>
      </div>
      <UAlert v-if="error" color="error" variant="soft" title="Approval not recorded" :description="error" />
    </div></template>
    <template #footer><div class="flex w-full justify-between gap-2"><UButton color="neutral" variant="ghost" @click="close">Cancel</UButton><UButton :loading="pending" :disabled="!canSubmit" @click="submit">Record approval</UButton></div></template>
  </UModal>
</template>
