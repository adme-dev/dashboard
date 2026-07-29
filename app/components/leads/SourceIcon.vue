<script setup lang="ts">
import type { LeadSource } from '~/types'

const props = defineProps<{ source: LeadSource; size?: 'sm' | 'md' }>()

const ICONS: Record<LeadSource, string> = {
  meta: 'i-lucide-facebook',
  google: 'i-lucide-search',
  manual: 'i-lucide-pencil',
  webhook: 'i-lucide-webhook',
  csv: 'i-lucide-file-spreadsheet',
  email: 'i-lucide-mail',
}
const TITLES: Record<LeadSource, string> = {
  meta: 'Meta Lead Ads',
  google: 'Google Lead Forms',
  manual: 'Manual entry',
  webhook: 'Webhook (Zapier / Make / custom)',
  csv: 'CSV import',
  email: 'Email ingestion',
}
</script>

<template>
  <UIcon
    :name="ICONS[props.source]"
    :class="props.size === 'sm' ? 'text-base' : 'text-lg'"
    class="text-muted"
    :aria-label="TITLES[props.source]"
  />
</template>
