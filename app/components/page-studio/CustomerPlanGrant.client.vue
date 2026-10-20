<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { getLocalTimeZone, type DateValue } from '@internationalized/date'
import type { CustomerPlanTarget } from '~~/shared/pageStudio/customerPlans'

const props = defineProps<{
  target: CustomerPlanTarget
}>()
const emit = defineEmits<{
  close: [
  ]
  granted: [
  ]
  invalidated: [
  ]
}>()
const { user } = useAuth()
const toast = useToast()
const actorKey = JSON.stringify(user.value)
const targetKey = JSON.stringify(props.target)
const attempted = ref(false)
const allowed = computed(() => JSON.stringify(user.value) === actorKey && JSON.stringify(props.target) === targetKey && ['owner', 'admin'].includes(user.value?.role ?? ''))
const saving = ref(false), locked = ref(false), message = ref<string | null>(null)
const timezone = getLocalTimeZone()
const ends = shallowRef<DateValue>()
const ongoing = ref(false)
const form = reactive({ planKey: '', reason: '', pagesPerSiteLimit: props.target.limits.pagesPerSiteLimit,
  storageMiB: Math.ceil(props.target.limits.storageBytesLimit / 1048576), domainLimit: 1, aiOperationLimit: 0,
  buildLimit: Math.max(1, props.target.limits.buildLimit), trafficMiB: Math.ceil(props.target.limits.trafficBytesLimit / 1048576) })
const limits = [
  { key: 'pagesPerSiteLimit', label: 'Pages', min: props.target.limits.pagesPerSiteLimit },
  { key: 'domainLimit', label: 'Custom domains', min: 1 },
  { key: 'storageMiB', label: 'Storage (MiB)', min: Math.ceil(props.target.limits.storageBytesLimit / 1048576) },
  { key: 'trafficMiB', label: 'Monthly traffic (MiB)', min: Math.ceil(props.target.limits.trafficBytesLimit / 1048576) },
  { key: 'buildLimit', label: 'Monthly builds', min: Math.max(1, props.target.limits.buildLimit) },
  { key: 'aiOperationLimit', label: 'Monthly AI operations', min: 0 }
] as const
const reviewed = ref<null | {
  requestId: string
  workspaceId: string
  expectedEntitlementId: string
  planKey: string
  reason: string
  pagesPerSiteLimit: number
  storageBytesLimit: number
  domainLimit: number
  aiOperationLimit: number
  buildLimit: number
  trafficBytesLimit: number
  effectiveUntil: string | null
}>(null)
watch(allowed, (value) => {
  if (!value) {
    locked.value = true
    reviewed.value = null
    message.value = 'Your access changed. Close this review and sign in again.'
  }
})
function review() {
  if (!allowed.value || locked.value || saving.value || !props.target.eligible)
    return
  message.value = null
  if (!/^[a-z][a-z0-9._-]{1,79}$/.test(form.planKey.trim()) || form.planKey.trim() === 'customer_preview_v1'
    || form.reason.trim().length < 3 || (!ongoing.value && !ends.value)) {
    message.value = 'Enter a plan reference, an approval reason and the agreed access period.'
    return
  }
  if (limits.some(limit => !Number.isSafeInteger(Number(form[limit.key])) || Number(form[limit.key]) < limit.min)) {
    message.value = 'Use whole-number limits at least as large as the current preview allowance.'
    return
  }
  const effectiveUntil = ongoing.value ? null : ends.value!.toDate(timezone).toISOString()
  if (effectiveUntil && Date.parse(effectiveUntil) <= Date.now()) {
    message.value = 'Choose a future end date.'
    return
  }
  const body = { workspaceId: props.target.workspaceId, expectedEntitlementId: props.target.entitlementId,
    planKey: form.planKey.trim(), reason: form.reason.trim(), effectiveUntil,
    pagesPerSiteLimit: Number(form.pagesPerSiteLimit), storageBytesLimit: Number(form.storageMiB) * 1048576,
    domainLimit: Number(form.domainLimit), aiOperationLimit: Number(form.aiOperationLimit), buildLimit: Number(form.buildLimit),
    trafficBytesLimit: Number(form.trafficMiB) * 1048576 }
  if (!Number.isSafeInteger(body.storageBytesLimit) || !Number.isSafeInteger(body.trafficBytesLimit)
    || [body.pagesPerSiteLimit, body.domainLimit, body.aiOperationLimit, body.buildLimit].some(value => value > 2147483647)) {
    message.value = 'One or more limits exceed the supported range.'
    return
  }
  reviewed.value = { ...body, requestId: crypto.randomUUID() }
}
async function save() {
  if (!allowed.value || locked.value || saving.value || !reviewed.value)
    return
  const body = { ...reviewed.value }
  attempted.value = true
  saving.value = true
  message.value = null
  try {
    const result = await $fetch<{
      entitlement: {
        id: string
        workspaceId: string
        siteId: string
        planKey: string
        status: string
      }
      replayed: boolean
    }>('/api/agency/page-studio/customer-plans', { method: 'POST', body })
    if (!allowed.value)
      return
    if (result.entitlement?.workspaceId !== props.target.workspaceId || result.entitlement?.siteId !== props.target.siteId
      || result.entitlement?.planKey !== body.planKey || result.entitlement?.status !== 'active'
      || !/^[0-9a-f-]{36}$/i.test(result.entitlement?.id ?? '') || typeof result.replayed !== 'boolean') {
      locked.value = true
      message.value = 'The saved result could not be confirmed. Close and refresh before making another change.'
      return
    }
    toast.add({ title: result.replayed ? 'Previous grant confirmed' : 'Publishing access granted',
      description: result.replayed ? 'Refresh to check the current plan status.' : 'The plan is recorded. Website launch and billing are separate steps.', color: 'success' })
    emit('granted')
  } catch (error: unknown) {
    if (!allowed.value) return
    const status = Number((error as {
      statusCode?: number
      status?: number
    })?.statusCode ?? (error as {
      status?: number
    })?.status)
    if (status === 400 || status === 413) {
      reviewed.value = null
      attempted.value = false
      message.value = 'Check the plan limits and access period, then review the terms again.'
    } else if ([401, 403, 409].includes(status)) {
      reviewed.value = null
      locked.value = true
      message.value = 'Access or the current plan has changed. Refresh the customer list before trying again.'
      emit('invalidated')
    } else
      message.value = 'The grant could not be confirmed. Retry this same request to safely check or complete it.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="true"
    :title="reviewed ? 'Review publishing access' : 'Set up a publishing plan'"
    :description="`${target.workspaceName} / ${target.siteName}`"
    :dismissible="!saving"
    :ui="{ content: 'max-w-2xl' }"
    scrollable
    @update:open="value => { if (!value && !saving) emit('close') }"
  >
    <template #body>
      <div class="@container space-y-6">
        <p class="max-w-prose text-sm text-muted">
          Replace this website’s preview allowance with the agreed publishing plan. Billing and website launch are separate steps.
        </p>
        <UAlert
          v-if="message"
          color="error"
          title="Plan needs attention"
          :description="message"
        />
        <template v-if="!reviewed">
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Plan reference" help="Use the agreed plan code." required>
              <UInput
                v-model="form.planKey"
                placeholder="e.g. studio_business"
                maxlength="80"
                class="w-full"
                :disabled="locked || !allowed"
              />
            </UFormField>
            <UFormField label="Access period" required>
              <UCheckbox v-model="ongoing" label="Ongoing, with no end date" :disabled="locked || !allowed" />
            </UFormField>
            <UFormField
              v-if="!ongoing"
              label="Access ends"
              :help="`Start of the selected day (${timezone}).`"
              required
              class="@lg:col-span-2"
            >
              <UPopover>
                <UButton
                  :label="ends?.toString() ?? 'Choose an end date'"
                  icon="i-lucide-calendar"
                  color="neutral"
                  variant="outline"
                  class="w-full"
                  :disabled="locked || !allowed"
                />
                <template #content>
                  <UCalendar v-model="ends" class="p-2" />
                </template>
              </UPopover>
            </UFormField>
          </div>
          <section>
            <h3 class="mb-1 font-semibold text-highlighted">
              Allowance for one website
            </h3>
            <p class="mb-4 text-sm text-muted">
              Current preview allowances are the minimum. AI operations stay at zero unless explicitly included in the agreement.
            </p>
            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField
                v-for="limit in limits"
                :key="limit.key"
                :label="limit.label"
                required
              >
                <UInput
                  v-model.number="form[limit.key]"
                  type="number"
                  :min="limit.min"
                  step="1"
                  class="w-full"
                  :disabled="locked || !allowed"
                />
              </UFormField>
            </div>
          </section>
          <UFormField label="Approval reason" help="Include the agreement or approval reference for the audit history." required>
            <UTextarea
              v-model="form.reason"
              :rows="3"
              maxlength="1000"
              class="w-full"
              :disabled="locked || !allowed"
            />
          </UFormField>
        </template>
        <template v-else>
          <dl class="grid grid-cols-1 gap-4 rounded-lg bg-elevated p-5 @lg:grid-cols-2">
            <div>
              <dt class="text-sm text-muted">
                Website
              </dt><dd class="font-semibold text-highlighted">
                {{ target.siteName }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                Plan
              </dt><dd class="font-semibold text-highlighted">
                {{ reviewed.planKey }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                Period
              </dt><dd>Starts now · {{ reviewed.effectiveUntil ? `Ends ${new Date(reviewed.effectiveUntil).toLocaleString()}` : 'No scheduled end date' }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                Pages / custom domains
              </dt><dd>{{ reviewed.pagesPerSiteLimit }} / {{ reviewed.domainLimit }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                Storage / monthly traffic (MiB)
              </dt><dd>{{ reviewed.storageBytesLimit / 1048576 }} / {{ reviewed.trafficBytesLimit / 1048576 }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                Monthly builds / AI operations
              </dt><dd>{{ reviewed.buildLimit }} / {{ reviewed.aiOperationLimit }}</dd>
            </div>
            <div class="@lg:col-span-2">
              <dt class="text-sm text-muted">
                Approval reason
              </dt><dd class="whitespace-pre-wrap break-words">
                {{ reviewed.reason }}
              </dd>
            </div>
          </dl>
          <p class="text-sm text-muted">
            This replaces the preview plan. The original preview approval remains in the audit record.
          </p>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          label="Close"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="emit('close')"
        />
        <UButton
          v-if="reviewed"
          label="Edit terms"
          color="neutral"
          variant="outline"
          :disabled="saving || locked || !allowed || attempted"
          @click="reviewed = null"
        />
        <UButton
          v-if="!reviewed"
          label="Review plan"
          :disabled="locked || !allowed"
          @click="review"
        />
        <UButton
          v-else
          label="Grant publishing access"
          :loading="saving"
          :disabled="locked || !allowed"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
