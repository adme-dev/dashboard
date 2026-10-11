<script setup lang="ts">
import type { CustomerCmsSetupStatus, CustomerCmsSetupRequest } from '~~/shared/pageStudio/customerCmsSetup'
import { mergeCustomerCmsSetupResponse } from '~/utils/pageStudioCmsSetupResponse'

const emit = defineEmits<{ changed: [] }>()
const api = '/api/portal/page-studio/customer/cms-setup'
const { data, error, refresh, status } = useFetch<CustomerCmsSetupStatus>(api, { server: false, timeout: 900000, watch: false })
const busy = ref(false), message = ref('')
const uncertain = ref(false)
const working = computed(() => busy.value || status.value === 'pending')
let active = true
let confirmedStep: { snapshot: CustomerCmsSetupStatus, kind: string } | null = null
onBeforeUnmount(() => {
  active = false
  confirmedStep = null
})
const labels = { 'collection': 'Content collections', 'workflow': 'Content tools', 'collection-staging': 'Draft storage', 'form-runtime': 'Form tools', 'form-drafts': 'Form draft storage' }
async function readback() {
  confirmedStep = null
  uncertain.value = true
  try {
    await refresh({ dedupe: 'defer' })
    if (active && !error.value && status.value === 'success' && data.value) uncertain.value = false
  } catch {
    if (active) message.value = 'Setup could not refresh. Refresh before continuing.'
  }
}
async function run(body: CustomerCmsSetupRequest) {
  if (working.value || error.value || uncertain.value || !active) return
  const before = data.value
  let refreshRequired = true
  busy.value = true
  confirmedStep = null
  message.value = ''
  try {
    const raw = await $fetch(api, { method: 'POST', body, timeout: 900000 })
    if (!active) return
    if (!before || data.value !== before || error.value || status.value !== 'success') throw new Error('Setup snapshot changed')
    const next = mergeCustomerCmsSetupResponse(before, body, raw)
    if (next) {
      data.value = next
      refreshRequired = false
      if (body.operation === 'schema') confirmedStep = { snapshot: data.value, kind: body.request.kind }
    }
  } catch {
    uncertain.value = true
    if (active) message.value = 'We could not confirm that step. Refresh its status before trying again.'
  } finally {
    if (active && refreshRequired) await readback()
    busy.value = false
    if (active) emit('changed')
  }
}
async function reload() {
  if (working.value || !active) return
  busy.value = true
  try {
    await readback()
    if (active && !uncertain.value) message.value = ''
  } finally { busy.value = false }
}
const adoption = computed(() => data.value?.adoption)
async function prepare(kind: keyof typeof labels) {
  if (working.value || error.value || uncertain.value || !active) return
  let current = data.value?.prerequisites.find(row => row.kind === kind)
  if (!current) return
  if (['reserved', 'running'].includes(current.status) && !(confirmedStep?.snapshot === data.value && confirmedStep.kind === kind)) {
    // Only this step's guarded response can avoid a duplicate read. Refresh
    // after uncertainty or any snapshot replacement; backend leases decide work.
    await readback()
    current = data.value?.prerequisites.find(row => row.kind === kind)
    if (error.value || uncertain.value || !active || !current || current.status === 'installed' || current.status === 'disabled') return
  }
  run({ operation: 'schema', request: current.status === 'reconciliation'
    ? { action: 'recover', kind, requestId: crypto.randomUUID(), expectedRecoveryId: current.recoveryId }
    : { action: 'start', kind, requestId: current.requestId ?? crypto.randomUUID() } })
}
function adopt() {
  if (working.value || error.value || uncertain.value || !active) return
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
        :disabled="working"
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
      :disabled="working || uncertain || Boolean(error)"
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
          :disabled="working || uncertain || Boolean(error) || (!step.canConfigure && step.status !== 'reconciliation') || data.prerequisites.slice(0, index).some(row => row.status !== 'installed')"
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
          :disabled="working || uncertain || Boolean(error) || data.prerequisites.some(row => row.status !== 'installed')"
          @click="adopt"
        />
      </li>
    </ol>
  </section>
</template>
