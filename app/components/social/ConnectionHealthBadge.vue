<script setup lang="ts">
import type { ConnectionHealth } from '~~/server/utils/connectionHealth'

const props = defineProps<{
  status: ConnectionHealth
  count?: number  // optional count (e.g. "113 expired")
  label?: string  // optional override for the text (e.g. "Meta")
}>()

interface Variant {
  color: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  icon: string
  text: string
}

const VARIANTS: Record<ConnectionHealth, Variant> = {
  healthy:        { color: 'success', icon: 'i-lucide-check-circle-2', text: 'healthy' },
  expiring_soon:  { color: 'warning', icon: 'i-lucide-clock',          text: 'expiring soon' },
  expired:        { color: 'error',   icon: 'i-lucide-alert-triangle', text: 'expired' },
  stale_sync:     { color: 'warning', icon: 'i-lucide-refresh-cw-off', text: 'stale sync' },
  never_synced:   { color: 'neutral', icon: 'i-lucide-pause',          text: 'never synced' },
  error:          { color: 'error',   icon: 'i-lucide-x-circle',       text: 'error' },
}

const variant = computed(() => VARIANTS[props.status])
const display = computed(() => {
  const base = props.label ? `${props.label}: ` : ''
  if (props.count != null && props.count > 0 && props.status !== 'healthy') {
    return `${base}${props.count} ${variant.value.text}`
  }
  return `${base}${variant.value.text}`
})
</script>

<template>
  <UBadge :color="variant.color" variant="soft" :icon="variant.icon" size="sm">
    {{ display }}
  </UBadge>
</template>
