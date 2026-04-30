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
      await $fetch(`/api/leads/rules/${props.ruleId}/destinations/${props.destination.id}`, {
        method: 'PUT', body,
      })
    } else {
      await $fetch(`/api/leads/rules/${props.ruleId}/destinations`, { method: 'POST', body })
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
  <UModal v-model:open="open" :ui="{ container: 'max-w-2xl' }">
    <template #content>
      <div class="p-6 space-y-4">
        <h3 class="text-base font-semibold">
          {{ destination.id ? 'Edit destination' : 'Add destination' }}
          <span class="text-muted font-normal">— {{ draft.destination_type }}</span>
        </h3>

        <component :is="ConfigComp" v-if="ConfigComp" v-model:config="draft.config" />

        <div v-if="Object.keys(errors).length" class="text-sm text-error">
          <p v-for="(msg, k) in errors" :key="k">{{ k }}: {{ msg }}</p>
        </div>

        <LeadsFilterBuilder
          v-model:filter="draft.filter"
          :source="formMeta.source"
          :form-id="formMeta.form_id"
        />

        <div class="space-y-1">
          <label class="text-xs text-muted">Delay</label>
          <USelectMenu v-model="draft.delay_minutes" :items="DELAY_OPTIONS" value-key="value" />
        </div>

        <div class="flex items-center gap-3">
          <UCheckbox v-model="draft.enabled" label="Enabled" />
          <UInput v-model.number="draft.sort_order" type="number" class="w-24" placeholder="Sort" />
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-default">
          <UButton variant="ghost" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" color="primary" @click="save">Save</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
