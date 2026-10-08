<script setup lang="ts">
import type { CustomerSetup } from '~~/shared/pageStudio/customerSignup'

const model = defineModel<CustomerSetup['goals']>({ required: true })
defineProps<{ disabled?: boolean }>()
const goals: { value: CustomerSetup['goals'][number], label: string }[] = [
  { value: 'enquiries', label: 'Receive enquiries and leads' },
  { value: 'bookings', label: 'Get appointments and bookings' },
  { value: 'sales', label: 'Sell products' },
  { value: 'services', label: 'Promote my services' },
  { value: 'local_business', label: 'Promote a local business' },
  { value: 'gallery', label: 'Showcase work and expertise' },
  { value: 'vehicles', label: 'Showcase vehicle stock' },
  { value: 'test_drives', label: 'Receive test-drive requests' },
  { value: 'blog', label: 'Publish articles and updates' },
  { value: 'newsletter', label: 'Grow a mailing list' },
  { value: 'events', label: 'Promote events' },
  { value: 'community', label: 'Build a community' },
  { value: 'resources', label: 'Share guides and resources' },
  { value: 'recruitment', label: 'Attract job applicants' }
]
</script>

<template>
  <UFormField
    label="Website goals"
    :ui="{ label: 'sr-only' }"
    help="Choose all that apply. These preferences help plan your website; they don’t activate features."
    required
    class="@container"
  >
    <UCheckboxGroup
      v-model="model"
      :items="goals"
      :disabled="disabled"
      color="neutral"
      variant="card"
      :ui="{ fieldset: 'grid grid-cols-1 @lg:grid-cols-2 gap-3', item: 'min-h-14 bg-elevated/50 rounded-md' }"
    />
  </UFormField>
</template>
