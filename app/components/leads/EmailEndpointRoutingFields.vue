<script setup lang="ts">
import { computed } from 'vue'
import {
  routingPresetPreview,
  type EmailEndpointDraft,
  type EmailEndpointTeamOption,
  type SafeEmailLeadEndpoint
} from '~/utils/emailEndpointUi'

const props = defineProps<{
  endpoint: SafeEmailLeadEndpoint | null
  team: EmailEndpointTeamOption[]
}>()
const emit = defineEmits<{
  'open-rule': []
}>()

const draft = defineModel<EmailEndpointDraft>({ required: true })
const isEditing = computed(() => Boolean(props.endpoint))
const presetDestinations = computed(() => routingPresetPreview(draft.value, props.team))
const routingOptions = [
  { value: 'none', label: 'No preset' },
  { value: 'portal', label: 'Client portal' },
  { value: 'portal_notification', label: 'Portal + email notification' },
  { value: 'assign_user', label: 'Assign user' }
]
const teamOptions = computed(() => [
  { value: 'none', label: 'Select a team member', disabled: true },
  ...props.team.map(member => ({ value: member.id, label: member.name }))
])
</script>

<template>
  <section class="space-y-4" aria-labelledby="routing-heading">
    <div>
      <h2 id="routing-heading" class="text-sm font-semibold">
        Routing
      </h2>
      <p class="text-sm text-muted">
        A preset creates the listed destinations when the endpoint is created.
      </p>
    </div>

    <UAlert
      v-if="isEditing"
      color="neutral"
      variant="soft"
      icon="i-lucide-info"
      title="Manage routing in Form rules"
      description="Routing customisation state is not supplied by the safe endpoint API, so preset changes are unavailable here."
    />

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField label="Routing preset" :help="isEditing ? 'Open the form rule to make routing changes.' : 'Optional.'">
        <USelectMenu
          v-model="draft.routingPreset"
          :items="routingOptions"
          value-key="value"
          class="w-full"
          :disabled="isEditing"
        />
      </UFormField>

      <UFormField
        v-if="draft.routingPreset === 'portal_notification' && !isEditing"
        label="Notification email"
        required
      >
        <UInput
          v-model="draft.notificationEmail"
          type="email"
          class="w-full"
          placeholder="leads@example.com"
        />
      </UFormField>

      <UFormField
        v-if="draft.routingPreset === 'assign_user' && !isEditing"
        label="Assigned user"
        required
      >
        <USelectMenu
          v-model="draft.assignedUserId"
          :items="teamOptions"
          value-key="value"
          class="w-full"
        />
      </UFormField>
    </div>

    <div
      v-if="presetDestinations.length && !isEditing"
      class="rounded-md border border-default bg-elevated/40 p-3"
    >
      <p class="text-sm font-medium">
        Destinations this preset will create
      </p>
      <ul class="mt-2 space-y-1 text-sm text-muted">
        <li
          v-for="destination in presetDestinations"
          :key="destination"
          class="flex items-center gap-2"
        >
          <UIcon name="i-lucide-route" class="size-4 shrink-0" />
          <span>{{ destination }}</span>
        </li>
      </ul>
    </div>

    <UButton
      v-if="isEditing"
      type="button"
      label="Open form rule"
      icon="i-lucide-route"
      color="neutral"
      variant="outline"
      @click="emit('open-rule')"
    />
  </section>
</template>
