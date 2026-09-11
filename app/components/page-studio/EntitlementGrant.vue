<script setup lang="ts">
import { getLocalTimeZone, today, type DateValue } from '@internationalized/date'

const emit = defineEmits<{ granted: [] }>()
const { hasPermission, canWrite } = useAuth()
const canGrant = computed(() => canWrite.value && hasPermission('PAGE_STUDIO_SUBSCRIPTIONS'))
const toast = useToast()
const open = ref(false)
const saving = ref(false)
const message = ref<string | null>(null)
const timezone = getLocalTimeZone()
const starts = shallowRef<DateValue>(today(timezone))
const ends = shallowRef<DateValue | undefined>()
const noExpiry = ref(false)
const request = ref<{ signature: string, id: string } | null>(null)
const form = reactive({
  clientId: undefined as string | undefined, planKey: '', status: 'trial', reason: '',
  portalCreationEnabled: false, allowedModules: ['business-content'],
  siteLimit: 1, pagesPerSiteLimit: 10, storageMiB: 1024, domainLimit: 0,
  aiOperationLimit: 100, buildLimit: 30, trafficMiB: 10240
})
const modules = [
  { label: 'Business content', value: 'business-content' }, { label: 'Bookings', value: 'bookings' },
  { label: 'Enquiries', value: 'enquiries' }, { label: 'Catalogue', value: 'catalogue' },
  { label: 'Delivery', value: 'delivery' }, { label: 'Inventory', value: 'inventory' }, { label: 'Orders', value: 'orders' }
]
const limits = [
  { key: 'siteLimit', label: 'Active websites', min: 0 },
  { key: 'pagesPerSiteLimit', label: 'Pages per website', min: 1 },
  { key: 'storageMiB', label: 'Storage (MiB)', min: 0 },
  { key: 'domainLimit', label: 'Custom domains', min: 0 },
  { key: 'aiOperationLimit', label: 'Monthly AI operations', min: 0 },
  { key: 'buildLimit', label: 'Monthly builds', min: 0 },
  { key: 'trafficMiB', label: 'Monthly traffic (MiB)', min: 0 }
] as const
const { data: clients, pending, error, refresh } = useFetch<Array<{ id: string, name: string, isActive: boolean }>>('/api/agency/clients', {
  immediate: false, server: false, watch: false, default: () => []
})
const clientOptions = computed(() => clients.value.filter(client => client.isActive).map(client => ({ label: client.name, value: client.id })))

async function start() {
  if (!canGrant.value) return
  open.value = true
  message.value = null
  await refresh()
}
function cancel() {
  if (!saving.value) open.value = false
}
function selectStart(value: DateValue | undefined) {
  if (value) starts.value = value
}
async function save() {
  if (!canGrant.value || saving.value || pending.value || error.value) return
  message.value = null
  if (!clientOptions.value.some(client => client.value === form.clientId)) {
    message.value = 'Select an active client.'
    return
  }
  if (!form.planKey.trim() || form.reason.trim().length < 3 || (!ends.value && !(form.status === 'active' && noExpiry.value))) {
    message.value = 'Enter the plan reference, reason and access end date.'
    return
  }
  const body = {
    clientId: form.clientId, planKey: form.planKey.trim(), status: form.status, reason: form.reason.trim(),
    effectiveFrom: starts.value.toDate(timezone).toISOString(),
    effectiveUntil: form.status === 'active' && noExpiry.value ? null : ends.value!.toDate(timezone).toISOString(),
    portalCreationEnabled: form.portalCreationEnabled, allowedModules: [...form.allowedModules].sort(),
    siteLimit: Number(form.siteLimit), pagesPerSiteLimit: Number(form.pagesPerSiteLimit),
    storageBytesLimit: Number(form.storageMiB) * 1048576, domainLimit: Number(form.domainLimit),
    aiOperationLimit: Number(form.aiOperationLimit), buildLimit: Number(form.buildLimit),
    trafficBytesLimit: Number(form.trafficMiB) * 1048576
  }
  const signature = JSON.stringify(body)
  if (request.value?.signature !== signature) request.value = { signature, id: crypto.randomUUID() }
  saving.value = true
  try {
    await $fetch('/api/agency/page-studio/subscriptions', { method: 'POST', body: { ...body, requestId: request.value.id } })
    open.value = false
    request.value = null
    toast.add({ title: 'Website access granted', description: 'Website creation follows the selected start date and limits. No charge has been created.', color: 'success' })
    emit('granted')
  } catch (error: unknown) {
    const data = error && typeof error === 'object' && 'data' in error ? error.data : null
    message.value = data && typeof data === 'object' && 'statusMessage' in data
      ? String(data.statusMessage)
      : 'Access could not be saved. Your entries are preserved for retry.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UButton
    v-if="canGrant"
    label="Grant website access"
    icon="i-lucide-plus"
    @click="start"
  />
  <UModal
    v-model:open="open"
    title="Grant website access"
    description="Record the agreed access period and limits for a client."
    :dismissible="!saving"
    :ui="{ content: 'max-w-3xl' }"
    scrollable
  >
    <template #body>
      <div class="@container space-y-6">
        <UAlert color="info" title="Access configuration" description="This records an agency-managed access grant. It does not create a paid subscription, invoice or provider charge. Existing access cannot be replaced here." />
        <UAlert
          v-if="message"
          color="error"
          title="Access could not be granted"
          :description="message"
        />
        <UAlert
          v-if="error"
          color="error"
          title="Clients could not be loaded"
          description="Retry before continuing."
        >
          <template #actions>
            <UButton
              label="Retry clients"
              color="neutral"
              variant="outline"
              @click="refresh()"
            />
          </template>
        </UAlert>
        <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
          <UFormField label="Client" required class="@lg:col-span-2">
            <USelectMenu
              v-model="form.clientId"
              :items="clientOptions"
              value-key="value"
              placeholder="Select a client"
              :disabled="saving || pending || Boolean(error)"
              :loading="pending"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Plan reference" help="Use the agreed plan code or internal project reference." required>
            <UInput
              v-model="form.planKey"
              :disabled="saving"
              placeholder="Lowercase letters, numbers and hyphens"
              maxlength="80"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Access status" required>
            <USelectMenu
              v-model="form.status"
              :items="[{ label: 'Trial', value: 'trial' }, { label: 'Active', value: 'active' }]"
              value-key="value"
              :disabled="saving"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Access starts" :help="timezone" required>
            <UPopover>
              <UButton
                :label="starts.toString()"
                icon="i-lucide-calendar"
                color="neutral"
                variant="outline"
                :disabled="saving"
                class="w-full"
              /><template #content>
                <UCalendar
                  :model-value="starts"
                  :disabled="saving"
                  class="p-2"
                  @update:model-value="selectStart"
                />
              </template>
            </UPopover>
          </UFormField>
          <UFormField label="Access ends" help="Access ends at the start of this day in the displayed timezone." :required="form.status === 'trial' || !noExpiry">
            <UPopover>
              <UButton
                :label="ends?.toString() ?? 'Choose an end date'"
                icon="i-lucide-calendar"
                color="neutral"
                variant="outline"
                :disabled="saving || (form.status === 'active' && noExpiry)"
                class="w-full"
              /><template #content>
                <UCalendar v-model="ends" :disabled="saving" class="p-2" />
              </template>
            </UPopover>
          </UFormField>
          <UFormField v-if="form.status === 'active'" label="Ongoing access" class="@lg:col-span-2">
            <UCheckbox v-model="noExpiry" label="No scheduled end date" :disabled="saving" />
          </UFormField>
          <UFormField
            label="Enabled modules"
            help="Business content is required. Module access does not activate unconfigured services."
            required
            class="@lg:col-span-2"
          >
            <USelectMenu
              v-model="form.allowedModules"
              :items="modules"
              value-key="value"
              multiple
              :disabled="saving"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Client self-service" class="@lg:col-span-2">
            <UCheckbox v-model="form.portalCreationEnabled" label="Allow authorised client users to create websites within this allowance" :disabled="saving" />
          </UFormField>
        </div>
        <div>
          <h3 class="mb-4 font-semibold text-highlighted">
            Usage limits
          </h3>
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
                :disabled="saving"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
        <UFormField label="Reason for this grant" help="Record the agreed arrangement or internal approval reference." required>
          <UTextarea
            v-model="form.reason"
            maxlength="1000"
            :rows="3"
            :disabled="saving"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="cancel"
        />
        <UButton
          label="Save access grant"
          :loading="saving"
          :disabled="!canGrant || pending || Boolean(error)"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
