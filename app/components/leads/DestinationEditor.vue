<script setup lang="ts">
import type { LeadRuleDestination, LeadDestinationType } from '~/types'

const props = defineProps<{
  ruleId: string
  formMeta: { source: string; form_id: string; form_name: string | null }
  destination: LeadRuleDestination
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'saved'): void }>()

const toast = useToast()
const draft = ref<LeadRuleDestination>(structuredClone({
  ...props.destination,
  config: props.destination.config ?? {},
}))
const saving = ref(false)
const errors = ref<Record<string, string>>({})
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const DELAY_OPTIONS = [
  { value: 0, label: 'Immediate' },
  { value: 5, label: '+ 5 min' },
  { value: 15, label: '+ 15 min' },
  { value: 60, label: '+ 1 hour' },
  { value: 120, label: '+ 2 hours' },
  { value: 1440, label: '+ 24 hours' },
]

const ConfigComp = computed(() => {
  switch (draft.value.destination_type) {
    case 'portal': return resolveComponent('LeadsDestinationConfigPortal')
    case 'webhook': return resolveComponent('LeadsDestinationConfigWebhook')
    case 'slack': return resolveComponent('LeadsDestinationConfigSlack')
    case 'email': return resolveComponent('LeadsDestinationConfigEmail')
    case 'sheets': return resolveComponent('LeadsDestinationConfigSheets')
    case 'assign_user': return resolveComponent('LeadsDestinationConfigAssignUser')
    default: return null
  }
})

// Field picker is only useful for destinations that have template fields.
const supportsTemplates = computed(() =>
  ['slack', 'email', 'webhook'].includes(draft.value.destination_type),
)

// Presets — pre-filled config for the most-used destination types. Only shown
// for new destinations whose config is essentially empty, so we don't overwrite
// a user's existing template by accident.
interface Preset { key: string; label: string; description: string; apply: () => void }

const isNewAndEmpty = computed(() => {
  if (props.destination.id) return false
  const cfg = draft.value.config ?? {}
  return Object.values(cfg).every(v => v == null || v === '' || (Array.isArray(v) && v.length === 0))
})

const SLACK_LEAD_ALERT_TEMPLATE = `🆕 *New lead* — {{ field.full_name }}
✉️ {{ field.email }} · 📞 {{ field.phone_number }}
Form: {{ form_name }} · {{ source }}`

const EMAIL_SUBJECT_TEMPLATE = 'New lead from {{ field.full_name }} — {{ form_name }}'
const EMAIL_BODY_TEMPLATE = `<h2 style="margin:0 0 12px;">New lead</h2>
<p><strong>{{ field.full_name }}</strong> just submitted {{ form_name }}.</p>
<ul style="line-height:1.6;">
  <li><strong>Email:</strong> {{ field.email }}</li>
  <li><strong>Phone:</strong> {{ field.phone_number }}</li>
</ul>
<p style="color:#888;font-size:12px;margin-top:16px;">
  Source: {{ source }} · Submitted: {{ submitted_at }}
</p>`

const presets = computed<Preset[]>(() => {
  switch (draft.value.destination_type) {
    case 'slack':
      return [
        {
          key: 'slack-alert',
          label: 'Lead alert',
          description: 'Compact one-message format with name, email, phone, form.',
          apply: () => {
            draft.value.config = {
              ...draft.value.config,
              message_template: SLACK_LEAD_ALERT_TEMPLATE,
            }
          },
        },
      ]
    case 'email':
      return [
        {
          key: 'email-notification',
          label: 'Sales notification',
          description: 'HTML email with bullet-list of lead details — sent to a sales inbox.',
          apply: () => {
            draft.value.config = {
              to: draft.value.config?.to ?? [],
              subject_template: EMAIL_SUBJECT_TEMPLATE,
              body_template: EMAIL_BODY_TEMPLATE,
              from: draft.value.config?.from,
            }
          },
        },
      ]
    default:
      return []
  }
})

async function save() {
  saving.value = true
  errors.value = {}
  try {
    const body = {
      destination_type: draft.value.destination_type,
      config: draft.value.config,
      filter: draft.value.filter,
      delay_minutes: draft.value.delay_minutes,
      enabled: draft.value.enabled,
      sort_order: draft.value.sort_order,
    }
    if (props.destination.id) {
      await apiFetch(`/api/leads/rules/${props.ruleId}/destinations/${props.destination.id}`, {
        method: 'PUT', body,
      })
    } else {
      await apiFetch(`/api/leads/rules/${props.ruleId}/destinations`, { method: 'POST', body })
    }
    toast.add({ title: 'Saved', color: 'success' })
    emit('saved')
    open.value = false
  } catch (e: any) {
    if (e?.data?.statusMessage === 'invalid_config' && e?.data?.data) errors.value = e.data.data
    toast.add({ title: 'Could not save', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: supportsTemplates ? 'max-w-4xl' : 'max-w-2xl' }">
    <template #content>
      <div class="p-6">
        <h3 class="text-base font-semibold mb-4">
          {{ destination.id ? 'Edit destination' : 'Add destination' }}
          <span class="text-muted font-normal">— {{ draft.destination_type }}</span>
        </h3>

        <div :class="supportsTemplates ? 'grid grid-cols-[1fr_240px] gap-6' : ''">
          <div class="space-y-4 min-w-0">
            <div v-if="presets.length && isNewAndEmpty" class="bg-elevated/40 border border-default rounded p-3 space-y-2">
              <p class="text-xs font-semibold uppercase text-muted tracking-wide">Quick start</p>
              <div class="space-y-2">
                <button
                  v-for="p in presets"
                  :key="p.key"
                  type="button"
                  class="w-full text-left px-3 py-2 rounded border border-default hover:border-primary-500 hover:bg-primary-500/5 transition-colors"
                  @click="p.apply()"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-sparkles" class="size-3.5 text-primary-500" />
                    <span class="text-sm font-medium">{{ p.label }}</span>
                  </div>
                  <p class="text-xs text-muted mt-0.5 ml-5">{{ p.description }}</p>
                </button>
              </div>
            </div>

            <component :is="ConfigComp" v-if="ConfigComp" v-model:config="draft.config" />

            <div v-if="Object.keys(errors).length" class="text-sm text-error">
              <p v-for="(msg, k) in errors" :key="k">{{ k }}: {{ msg }}</p>
            </div>

            <LeadsFilterBuilder
              v-model:filter="draft.filter"
              :source="formMeta.source"
              :form-id="formMeta.form_id"
            />

            <UFormField label="Delay" hint="Wait before firing — useful for follow-up email after Slack ping">
              <USelectMenu v-model="draft.delay_minutes" :items="DELAY_OPTIONS" value-key="value" class="w-full" />
            </UFormField>

            <div class="flex items-center gap-3">
              <UCheckbox v-model="draft.enabled" label="Enabled" />
              <UInput v-model.number="draft.sort_order" type="number" class="w-24" placeholder="Sort" />
            </div>
          </div>

          <aside v-if="supportsTemplates" class="border-l border-default pl-6 -mr-6 pr-6">
            <LeadsFieldPicker
              :source="formMeta.source"
              :form-id="formMeta.form_id"
            />
          </aside>
        </div>

        <div class="flex justify-end gap-2 pt-4 mt-4 border-t border-default">
          <UButton variant="ghost" color="neutral" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" color="primary" icon="i-lucide-check" @click="save">Save</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
