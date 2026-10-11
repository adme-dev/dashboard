<script setup lang="ts">
import type { CustomerCmsSetupStatus, CustomerCmsSetupRequest } from '~~/shared/pageStudio/customerCmsSetup'

const emit = defineEmits<{ changed: [] }>()
const api = '/api/portal/page-studio/customer/cms-setup'
const { data, error, refresh } = useFetch<CustomerCmsSetupStatus>(api, { server: false, timeout: 300000 })
const busy = ref(false), message = ref('')
const labels = { 'collection': 'Content collections', 'workflow': 'Content tools', 'collection-staging': 'Draft storage', 'form-runtime': 'Form tools', 'form-drafts': 'Form draft storage' }
async function run(body: CustomerCmsSetupRequest) {
  if (busy.value || error.value) return
  busy.value = true
  message.value = ''
  try {
    await $fetch(api, { method: 'POST', body, timeout: 300000 })
  } catch {
    message.value = 'We could not confirm that step. Refresh its status before trying again.'
  } finally {
    await refresh()
    busy.value = false
    emit('changed')
  }
}
async function reload() {
  if (!busy.value) {
    await refresh()
    message.value = ''
  }
}
const adoption = computed(() => data.value?.adoption)
async function prepare(kind: keyof typeof labels) {
  if (busy.value || error.value) return
  let current = data.value?.prerequisites.find(row => row.kind === kind)
  if (!current) return
  if (['reserved', 'running'].includes(current.status)) {
    // Refresh retained identity before an explicit same-request resume. The
    // coordinator alone decides whether its lease allows work; never infer it
    // from a browser timeout or strand an expired retained operation.
    await refresh()
    current = data.value?.prerequisites.find(row => row.kind === kind)
    if (error.value || !current || current.status === 'installed' || current.status === 'disabled') return
  }
  run({ operation: 'schema', request: current.status === 'reconciliation'
    ? { action: 'recover', kind, requestId: crypto.randomUUID(), expectedRecoveryId: current.recoveryId }
    : { action: 'start', kind, requestId: current.requestId ?? crypto.randomUUID() } })
}
function adopt() {
  const value = adoption.value
  if (!value) return
  if (value.recoveryRequired && value.adoptionId) run({ operation: 'adoption', request: { action: 'recover', adoptionId: value.adoptionId, recoveryId: crypto.randomUUID(), expectedRecoveryId: value.recoveryId } })
  else if (value.phase === 'idle') run({ operation: 'adoption', request: { action: 'start' } })
  else if (value.adoptionId && value.phase !== 'managed') run({ operation: 'adoption', request: { action: 'advance', adoptionId: value.adoptionId, expectedProgressDigest: value.progressDigest } })
}
</script>

<template>
  <section class="border-b border-default px-6 py-5 sm:px-8" aria-label="Prepare website content">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="font-semibold text-highlighted">
          Prepare website content
        </h3>
        <p class="mt-1 text-sm leading-6 text-muted">
          Finish preparing your private content workspace. Your website stays unpublished.
        </p>
      </div>
      <UButton
        label="Refresh content setup"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :disabled="busy"
        @click="reload"
      />
    </div>
    <UAlert
      v-if="error || message"
      class="mt-4"
      color="warning"
      title="Check content setup"
      :description="message || 'Setup could not refresh. Refresh before continuing.'"
    />
    <UButton
      v-if="data?.resumeRequired"
      class="mt-4"
      label="Resume content setup"
      :loading="busy"
      :disabled="Boolean(error)"
      @click="run({ operation: 'resume' })"
    />
    <ol v-else-if="data" class="mt-5 space-y-3">
      <li v-for="(step, index) in data.prerequisites" :key="step.kind" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default px-4 py-3 text-sm">
        <span>{{ labels[step.kind] }}<span v-if="step.status === 'installed'" class="ml-2 text-success">Ready</span><span v-else-if="['reserved', 'running'].includes(step.status)" class="ml-2 text-muted">Preparing</span></span>
        <UButton
          v-if="step.status !== 'installed'"
          :label="step.status === 'reconciliation' ? 'Recover this step' : ['reserved', 'running'].includes(step.status) ? 'Resume step' : 'Prepare'"
          color="neutral"
          variant="outline"
          :loading="busy"
          :disabled="Boolean(error) || (!step.canConfigure && step.status !== 'reconciliation') || data.prerequisites.slice(0, index).some(row => row.status !== 'installed')"
          @click="prepare(step.kind)"
        />
      </li>
      <li v-if="adoption" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default px-4 py-3 text-sm">
        <span>Website content workspace<span v-if="adoption.phase === 'managed'" class="ml-2 text-success">Ready</span></span>
        <UButton
          v-if="adoption.phase !== 'managed'"
          :label="adoption.recoveryRequired ? 'Recover content workspace' : 'Continue content setup'"
          color="neutral"
          variant="outline"
          :loading="busy"
          :disabled="Boolean(error) || data.prerequisites.some(row => row.status !== 'installed')"
          @click="adopt"
        />
      </li>
    </ol>
  </section>
</template>
