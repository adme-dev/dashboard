<script setup lang="ts">
const config = defineModel<Record<string, unknown>>('config', { default: () => ({}) })

const label = computed({
  get: () => typeof config.value.label === 'string' ? config.value.label : '',
  set: (value: string) => {
    config.value = { ...config.value, label: value }
  }
})

const includeCampaignContext = computed({
  get: () => config.value.include_campaign_context === true,
  set: (value: boolean) => {
    config.value = { ...config.value, include_campaign_context: value }
  }
})
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="primary"
      variant="soft"
      icon="i-lucide-monitor"
      title="Show matching leads in the client portal"
      description="When this destination is enabled, clients mapped to this form can see their own leads at /portal/leads. The portal API still filters by client and only exposes leads from rules with this enabled destination."
    />

    <UFormField
      label="Client-facing label"
      hint="Optional. Helps staff describe why this form is shared."
    >
      <UInput
        v-model="label"
        placeholder="Website enquiries, Google lead form, Meta campaign"
      />
    </UFormField>

    <UCheckbox
      v-model="includeCampaignContext"
      label="Show campaign and ad context where available"
      description="Clients will see campaign and ad names already stored on each lead."
    />
  </div>
</template>
