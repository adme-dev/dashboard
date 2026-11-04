<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEdmCampaignTemplateSelection } from '~~/app/composables/useEdmCampaignTemplateSelection'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [campaignId: string] }>()
const flow = useEdmCampaignTemplateSelection()
type Template = { id: string, name: string, client_id: string | null, head_revision_id: string, revision_schema_version: number, template_kind: string }
const templates = ref<Template[]>([])
const clients = ref<Array<{ id: string, name: string }>>([])
const templateId = ref('__none__')
const clientId = ref('__none__')
const name = ref('')
const subject = ref('')
const loading = ref(false)
const loadError = ref('')
const selected = computed(() => templates.value.find(template => template.id === templateId.value))
const eligible = computed(() => templates.value.filter(template => template.client_id === null || template.client_id === clientId.value))
const ready = computed(() => !!selected.value && clientId.value !== '__none__' && !!name.value.trim() && eligible.value.includes(selected.value))
watch(clientId, () => {
  if (!flow.pending.value && !eligible.value.some(template => template.id === templateId.value)) templateId.value = '__none__'
})
watch(open, async (value) => {
  if (!value || flow.pending.value) return
  loading.value = true
  loadError.value = ''
  templateId.value = '__none__'
  try {
    const [library, choices] = await Promise.all([
      $fetch<{ items: Template[] }>('/api/email/templates'),
      $fetch<{ clients: Array<{ id: string, name: string }> }>('/api/email/template-clients')
    ])
    templates.value = library.items.filter(template => template.template_kind === 'template' && template.revision_schema_version === 1 && !!template.head_revision_id)
    clients.value = choices.clients
  } catch {
    loadError.value = 'Template choices could not load. Close and reopen to retry.'
  } finally {
    loading.value = false
  }
})
async function create() {
  if (!ready.value && !flow.pending.value) return
  try {
    const receipt = await flow.create({ templateId: selected.value?.id ?? '', revisionId: selected.value?.head_revision_id ?? '', clientId: clientId.value, name: name.value, subject: subject.value })
    if (receipt) {
      open.value = false
      emit('created', receipt.campaignId)
    }
  } catch { /* The retained request and actionable message stay in this dialog. */ }
}
</script>

<template>
  <UModal v-model:open="open" title="Create campaign from template" :dismissible="!flow.pending.value && !flow.busy.value">
    <template #content>
      <div class="@container max-h-[85svh] overflow-y-auto space-y-4 p-5">
        <div class="space-y-1">
          <h2 class="text-lg font-semibold">
            Create campaign from template
          </h2>
          <p class="text-sm text-muted">
            Start an independent campaign from the saved version you choose.
          </p>
        </div>
        <UAlert v-if="loadError || flow.error.value" color="error" :title="loadError || flow.error.value" />
        <div class="grid grid-cols-1 gap-4" :inert="flow.pending.value || flow.busy.value">
          <UFormField label="Client" required>
            <USelect
              v-model="clientId"
              :items="[{ label: 'Choose a client', value: '__none__' }, ...clients.map(client => ({ label: client.name, value: client.id }))]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Published template" required>
            <USelect
              v-model="templateId"
              :loading="loading"
              :items="[{ label: 'Choose a template', value: '__none__' }, ...eligible.map(template => ({ label: template.name, value: template.id }))]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <p v-if="selected" class="text-xs text-muted">
            Saved version {{ selected.head_revision_id }}. Later library changes will not update this campaign.
          </p>
          <UFormField label="Campaign name" required>
            <UInput v-model="name" :maxlength="200" class="w-full" />
          </UFormField>
          <UFormField label="Subject line" help="Leave blank to use the selected template subject.">
            <UInput v-model="subject" :maxlength="300" class="w-full" />
          </UFormField>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            label="Cancel"
            variant="ghost"
            color="neutral"
            :disabled="flow.pending.value || flow.busy.value"
            @click="open = false"
          />
          <UButton
            :label="flow.pending.value ? 'Retry original action' : 'Create campaign'"
            :loading="flow.busy.value"
            :disabled="loading || (!ready && !flow.pending.value)"
            @click="create"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
