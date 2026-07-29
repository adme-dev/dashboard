<script setup lang="ts">
import { computed } from 'vue'
import {
  classifyEmailEndpointHealth,
  type SafeEmailLeadEndpoint
} from '~/utils/emailEndpointUi'

const props = defineProps<{
  endpoint: SafeEmailLeadEndpoint
}>()

const health = computed(() => classifyEmailEndpointHealth(props.endpoint))
</script>

<template>
  <UTooltip :text="health.description">
    <UBadge
      :color="health.color"
      variant="soft"
      size="sm"
      class="whitespace-nowrap"
    >
      {{ health.label }}
    </UBadge>
  </UTooltip>
</template>
