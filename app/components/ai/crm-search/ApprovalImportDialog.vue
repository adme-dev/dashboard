<script setup lang="ts">
import { CalendarDate, getLocalTimeZone } from '@internationalized/date'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean], changed: [] }>()
const model = computed({ get: () => props.open, set: value => emit('update:open', value) })
const pending = ref(false); const error = ref<string | null>(null)
const now = new Date(); const future = new Date(Date.now() + 7 * 86_400_000)
const issuedDate = shallowRef(new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate()))
const expiresDate = shallowRef(new CalendarDate(future.getFullYear(), future.getMonth() + 1, future.getDate()))
const form = reactive({ environment: 'production', implementationGitSha: '', artifactManifestDigest: '', bindingManifestDigest: '', evidenceBundleHash: '', maximumCostUsdMicros: 0, approvedBy: '', requestedByActorId: '', importedProvenanceHash: '', reason: '' })
const environmentOptions = ['preview', 'production'].map(value => ({ label: value, value }))
const issuedAt = computed(() => issuedDate.value.toDate(getLocalTimeZone()).toISOString())
const expiresAt = computed(() => expiresDate.value.toDate(getLocalTimeZone()).toISOString())
const canSubmit = computed(() => Boolean(form.implementationGitSha && form.artifactManifestDigest && form.bindingManifestDigest && form.evidenceBundleHash && form.approvedBy && form.requestedByActorId && form.importedProvenanceHash && form.reason.trim().length >= 10 && !pending.value))
function close() { model.value = false }

async function submit() {
  if (!canSubmit.value) return
  pending.value = true; error.value = null
  try {
    await $fetch('/api/admin/crm-search/approvals/import', { method: 'POST', body: {
      approvalType: 'resource_provision', ...form, issuedAt: issuedAt.value, expiresAt: expiresAt.value
    } })
    emit('changed'); model.value = false
  } catch { error.value = 'The bootstrap approval import was rejected. Original timestamp, provenance hash, evidence, expiry, and actor separation must remain intact.' }
  finally { pending.value = false }
}
</script>

<template>
  <UModal v-model:open="model" title="Import resource approval" description="Bootstrap import preserves original authority; it does not reissue the approval.">
    <template #body><div class="@container max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <UAlert color="info" variant="soft" title="resource_provision only" description="The original issuedAt and importedProvenanceHash are immutable evidence." />
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Environment"><USelectMenu v-model="form.environment" :items="environmentOptions" value-key="value" class="w-full" /></UFormField>
        <UFormField label="Original approver ID"><UInput v-model="form.approvedBy" class="w-full" /></UFormField>
        <UFormField label="Original requester ID"><UInput v-model="form.requestedByActorId" class="w-full" /></UFormField>
        <UFormField label="Implementation Git SHA"><UInput v-model="form.implementationGitSha" class="w-full" /></UFormField>
        <UFormField label="Artifact manifest digest"><UInput v-model="form.artifactManifestDigest" class="w-full" /></UFormField>
        <UFormField label="Binding manifest digest"><UInput v-model="form.bindingManifestDigest" class="w-full" /></UFormField>
        <UFormField label="Evidence bundle hash"><UInput v-model="form.evidenceBundleHash" class="w-full" /></UFormField>
        <UFormField label="Provenance hash"><UInput v-model="form.importedProvenanceHash" class="w-full" /></UFormField>
        <UFormField label="Maximum cost (USD micros)"><UInput v-model.number="form.maximumCostUsdMicros" type="number" class="w-full" /></UFormField>
        <UFormField label="Original issue date"><UPopover><UButton color="neutral" variant="outline" class="w-full justify-start">{{ issuedAt }}</UButton><template #content><div class="p-3"><UCalendar v-model="issuedDate" /></div></template></UPopover></UFormField>
        <UFormField label="Expiry date"><UPopover><UButton color="neutral" variant="outline" class="w-full justify-start">{{ expiresAt }}</UButton><template #content><div class="p-3"><UCalendar v-model="expiresDate" /></div></template></UPopover></UFormField>
        <UFormField label="Import reason" class="@lg:col-span-2"><UTextarea v-model="form.reason" :rows="3" class="w-full" /></UFormField>
      </div>
      <UAlert v-if="error" color="error" variant="soft" title="Import unavailable" :description="error" />
    </div></template>
    <template #footer><div class="flex w-full justify-between gap-2"><UButton color="neutral" variant="ghost" @click="close">Cancel</UButton><UButton :loading="pending" :disabled="!canSubmit" @click="submit">Import immutable approval</UButton></div></template>
  </UModal>
</template>
