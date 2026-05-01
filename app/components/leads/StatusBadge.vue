<script setup lang="ts">
import type { LeadStatus } from '~/types'

const props = defineProps<{ status: LeadStatus }>()

const COLORS: Record<LeadStatus, 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  new: 'info',
  contacted: 'primary',
  qualified: 'success',
  won: 'success',
  lost: 'neutral',
  spam_suspected: 'warning',
}

const LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  won: 'Won',
  lost: 'Lost',
  spam_suspected: 'Spam?',
}
</script>

<template>
  <UBadge :color="COLORS[props.status]" variant="soft" size="sm">
    {{ LABELS[props.status] }}
  </UBadge>
</template>
