<script setup lang="ts">
import { toRef } from 'vue'
import { useEmailEndpointEditor } from '~/composables/useEmailEndpointEditor'
import type {
  EmailEndpointClientOption,
  EmailEndpointTeamOption,
  SafeEmailLeadEndpoint
} from '~/utils/emailEndpointUi'

const props = defineProps<{
  open: boolean
  endpoint: SafeEmailLeadEndpoint | null
  clients: EmailEndpointClientOption[]
  team: EmailEndpointTeamOption[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: [endpoint: SafeEmailLeadEndpoint]
  'open-rule': []
}>()

function close() {
  emit('update:open', false)
}

const {
  draft,
  saving,
  showAdvanced,
  showPresetConfirmation,
  isEditing,
  presetDestinations,
  requestSave,
  persist
} = useEmailEndpointEditor(
  toRef(props, 'open'),
  toRef(props, 'endpoint'),
  toRef(props, 'team'),
  {
    onSaved: endpoint => emit('saved', endpoint),
    onClose: close
  }
)
</script>

<template>
  <USlideover
    :open="open"
    :title="isEditing ? 'Edit email address' : 'Create email address'"
    :description="isEditing ? endpoint?.email_address : 'Create an agency-managed inbound address for a client.'"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <form class="@container space-y-6" @submit.prevent="requestSave">
        <LeadsEmailEndpointDetailsFields
          v-model="draft"
          :endpoint="endpoint"
          :clients="clients"
        />
        <LeadsEmailEndpointPolicyFields
          v-model="draft"
          :endpoint="endpoint"
        />
        <LeadsEmailEndpointRoutingFields
          v-model="draft"
          :endpoint="endpoint"
          :team="team"
          @open-rule="emit('open-rule')"
        />

        <UAlert
          color="neutral"
          variant="soft"
          icon="i-lucide-shield-check"
          title="Fixed quarantine retention"
          description="Raw email is encrypted and retained for 7 days when quarantine is required."
        />

        <UCollapsible v-model:open="showAdvanced">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            icon="i-lucide-settings-2"
            label="Advanced details"
            :trailing-icon="showAdvanced ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          />
          <template #content>
            <dl class="mt-3 grid grid-cols-1 gap-3 rounded-md border border-default p-3 text-sm @lg:grid-cols-2">
              <div>
                <dt class="text-muted">
                  Form ID
                </dt>
                <dd class="mt-1 break-all font-mono text-xs">
                  {{ endpoint?.form_id ?? 'Generated when saved' }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">
                  Diagnostics
                </dt>
                <dd class="mt-1">
                  Agency-only safe metadata; opaque tokens are never returned.
                </dd>
              </div>
            </dl>
          </template>
        </UCollapsible>
      </form>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          type="button"
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="close"
        />
        <UButton
          type="button"
          :label="isEditing ? 'Save changes' : 'Create address'"
          icon="i-lucide-check"
          :loading="saving"
          :disabled="saving"
          @click="requestSave"
        />
      </div>
    </template>
  </USlideover>

  <LeadsEmailEndpointPresetConfirmation
    v-model:open="showPresetConfirmation"
    :destinations="presetDestinations"
    :saving="saving"
    @confirm="persist"
  />
</template>
