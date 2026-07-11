<script setup lang="ts">
// F10 — contact-preference toggles for a person. Saves each change immediately via
// the people PATCH (which audits the change). Surfaces a visible do-not-contact flag.
const props = defineProps<{ clientId: string, record: Record<string, any> }>()
const base = inject<string>('crmApiBase', '/api/crm')
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const state = reactive({
  do_not_contact: !!props.record.do_not_contact,
  do_not_email: !!props.record.do_not_email,
  do_not_call: !!props.record.do_not_call,
  do_not_sms: !!props.record.do_not_sms,
  preferred_channel: (props.record.preferred_channel ?? 'none') as string,
  best_time: (props.record.best_time ?? '') as string,
})

const channelOptions = [
  { label: 'No preference', value: 'none' },
  { label: 'Email', value: 'email' }, { label: 'Phone', value: 'call' },
  { label: 'SMS', value: 'sms' }, { label: 'In person', value: 'meeting' },
]

const saving = ref(false)
async function patch(body: Record<string, unknown>) {
  saving.value = true
  try {
    await apiFetch(`${base}/people/${props.record.id}`, { method: 'PATCH', body: { ...body, client_id: props.clientId } })
  } catch (e: any) {
    toast.add({ title: 'Could not save preference', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}
function setFlag(key: 'do_not_contact' | 'do_not_email' | 'do_not_call' | 'do_not_sms', val: boolean) {
  state[key] = val
  patch({ [key]: val })
}
function setChannel(val: string) { state.preferred_channel = val; patch({ preferred_channel: val === 'none' ? null : val }) }
function saveBestTime() { patch({ best_time: state.best_time.trim() || null }) }
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-muted">Contact preferences</h3>
      <UBadge v-if="state.do_not_contact" color="error" variant="subtle" size="sm" icon="i-lucide-ban">Do not contact</UBadge>
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <label class="flex items-center justify-between gap-3 px-3 py-2">
        <span class="text-sm">Do not contact <span class="text-xs text-muted">(all channels)</span></span>
        <USwitch :model-value="state.do_not_contact" @update:model-value="(v: boolean) => setFlag('do_not_contact', !!v)" />
      </label>
      <label class="flex items-center justify-between gap-3 px-3 py-2" :class="state.do_not_contact ? 'opacity-50' : ''">
        <span class="text-sm">Do not email</span>
        <USwitch :model-value="state.do_not_email" :disabled="state.do_not_contact" @update:model-value="(v: boolean) => setFlag('do_not_email', !!v)" />
      </label>
      <label class="flex items-center justify-between gap-3 px-3 py-2" :class="state.do_not_contact ? 'opacity-50' : ''">
        <span class="text-sm">Do not call</span>
        <USwitch :model-value="state.do_not_call" :disabled="state.do_not_contact" @update:model-value="(v: boolean) => setFlag('do_not_call', !!v)" />
      </label>
      <label class="flex items-center justify-between gap-3 px-3 py-2" :class="state.do_not_contact ? 'opacity-50' : ''">
        <span class="text-sm">Do not SMS</span>
        <USwitch :model-value="state.do_not_sms" :disabled="state.do_not_contact" @update:model-value="(v: boolean) => setFlag('do_not_sms', !!v)" />
      </label>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <UFormField label="Preferred channel">
        <USelect :model-value="state.preferred_channel" :items="channelOptions" value-key="value" size="sm" @update:model-value="(v: string) => setChannel(v)" />
      </UFormField>
      <UFormField label="Best time">
        <UInput v-model="state.best_time" placeholder="e.g. mornings" size="sm" @blur="saveBestTime" />
      </UFormField>
    </div>
  </div>
</template>
