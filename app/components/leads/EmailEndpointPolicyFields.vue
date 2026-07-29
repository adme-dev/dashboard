<script setup lang="ts">
import type { EmailEndpointDraft, SafeEmailLeadEndpoint } from '~/utils/emailEndpointUi'

defineProps<{
  endpoint: SafeEmailLeadEndpoint | null
}>()

const draft = defineModel<EmailEndpointDraft>({ required: true })
const parserOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'adf', label: 'ADF/XML' },
  { value: 'generic', label: 'Generic labelled' }
]
const aiOptions = [
  { value: 'disabled', label: 'Off' },
  { value: 'fallback', label: 'Platform-gated fallback', disabled: true }
]
const cadenceOptions = [
  { value: 'none', label: 'No expectation' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom max silence' }
]
</script>

<template>
  <section class="space-y-4" aria-labelledby="parsing-heading">
    <div>
      <h2 id="parsing-heading" class="text-sm font-semibold">
        Parsing and trust
      </h2>
      <p class="text-sm text-muted">
        Restrict senders when a provider publishes stable delivery domains.
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
      <UFormField label="Parser mode" required>
        <USelectMenu
          v-model="draft.parserMode"
          :items="parserOptions"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="AI fallback"
        help="AI fallback is unavailable until the platform capability is exposed."
      >
        <USelectMenu
          v-model="draft.aiExtractionMode"
          :items="aiOptions"
          value-key="value"
          class="w-full"
          :disabled="endpoint?.ai_extraction_mode === 'fallback'"
        />
      </UFormField>

      <UFormField
        label="Allowed sender domains"
        help="Press Enter after each domain. Leave empty to accept any sender domain."
        class="@lg:col-span-2"
      >
        <UInputTags
          v-model="draft.allowedSenderDomains"
          class="w-full"
          placeholder="e.g. delivery.carsales.com.au"
        />
      </UFormField>
    </div>
  </section>

  <section class="space-y-4" aria-labelledby="service-level-heading">
    <div>
      <h2 id="service-level-heading" class="text-sm font-semibold">
        Service expectations
      </h2>
      <p class="text-sm text-muted">
        Cadence changes endpoint health; SLA records the intended first-response target.
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
      <UFormField label="Expected cadence">
        <USelectMenu
          v-model="draft.cadence"
          :items="cadenceOptions"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="draft.cadence === 'custom'"
        label="Custom max silence"
        help="Hours, from 1 to 8,760."
      >
        <UInput
          v-model.number="draft.customSilenceHours"
          type="number"
          :min="1"
          :max="8760"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="First-response SLA"
        help="Optional target in minutes."
        :class="{ '@lg:col-span-2': draft.cadence === 'custom' }"
      >
        <UInput
          v-model.number="draft.firstResponseSlaMinutes"
          type="number"
          :min="1"
          :max="43200"
          class="w-full"
          placeholder="e.g. 30"
        />
      </UFormField>
    </div>
  </section>
</template>
