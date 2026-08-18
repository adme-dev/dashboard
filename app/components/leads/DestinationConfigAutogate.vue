<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { required: true })

const LEAD_TYPE_OPTIONS = [
  { value: 'Used', label: 'Used vehicle' },
  { value: 'New', label: 'New vehicle' },
  { value: 'General', label: 'General enquiry' },
  { value: 'Service', label: 'Service enquiry' },
]

const tagsText = computed({
  get: () => Array.isArray(config.value.tags) ? config.value.tags.join(', ') : '',
  set: (value: string) => {
    config.value.tags = value
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
  },
})
</script>

<template>
  <div class="@container space-y-4">
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-shield-check"
      title="Shared credentials stay encrypted"
      description="This destination stores dealership routing only. The shared AutoGate username and password remain protected in Cloudflare."
    />

    <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
      <UFormField label="Seller Identifier" hint="The dealership GUID issued by carsales/AutoGate." required>
        <UInput
          v-model="config.sellerIdentifier"
          class="w-full font-mono"
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </UFormField>

      <UFormField label="Lead type" hint="How AutoGate should categorise this enquiry.">
        <USelectMenu
          v-model="config.leadType"
          :items="LEAD_TYPE_OPTIONS"
          value-key="value"
          class="w-full"
          placeholder="Select lead type"
        />
      </UFormField>

      <UFormField
        label="Site origin"
        hint="Bare domain only; do not include https:// or a path."
        required
      >
        <UInput
          v-model="config.siteOrigin"
          class="w-full"
          placeholder="dealer.example.com.au"
        />
      </UFormField>

      <UFormField
        label="Source IP address"
        hint="Public IPv4 or IPv6 address supplied for this integration."
        required
      >
        <UInput
          v-model="config.ipAddress"
          class="w-full font-mono"
          placeholder="203.0.113.10"
        />
      </UFormField>

      <UFormField label="Service" hint="Defaults to ADME when left blank.">
        <UInput v-model="config.service" class="w-full" placeholder="ADME" />
      </UFormField>

      <UFormField label="Page source" hint="AutoGate page context; usually details.">
        <UInput v-model="config.pageSource" class="w-full" placeholder="details" />
      </UFormField>

      <UFormField
        label="Tags"
        hint="Comma-separated labels added to every lead from this destination."
        class="@lg:col-span-2"
      >
        <UInput
          v-model="tagsText"
          class="w-full"
          placeholder="Meta, Northern EV Centre"
        />
      </UFormField>
    </div>
  </div>
</template>
