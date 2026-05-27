<script setup lang="ts">
const config = defineModel<Record<string, unknown>>('config', { default: () => ({}) })
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
        v-model="config.label"
        placeholder="Website enquiries, Google lead form, Meta campaign"
      />
    </UFormField>

    <UCheckbox
      v-model="config.include_campaign_context"
      label="Show campaign and ad context where available"
      description="Clients will see campaign and ad names already stored on each lead."
    />
  </div>
</template>
