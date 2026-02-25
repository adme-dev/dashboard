<template>
  <span
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
    :style="badgeStyle"
  >
    <UIcon v-if="statusDef.icon" :name="statusDef.icon" class="w-3 h-3" />
    {{ statusDef.label }}
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{
  status: string | null | undefined
}>()

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  'not_billed': { label: 'Not Billed', color: '#6B7280', bg: '#F3F4F6', icon: 'i-lucide-circle' },
  'in_eom_queue': { label: 'In EOM Queue', color: '#1D4ED8', bg: '#DBEAFE', icon: 'i-lucide-clock' },
  'in_review': { label: 'In Review', color: '#92400E', bg: '#FEF3C7', icon: 'i-lucide-eye' },
  'draft_in_xero': { label: 'DRAFT in Xero', color: '#9A3412', bg: '#FFEDD5', icon: 'i-lucide-file-text' },
  'authorised': { label: 'AUTHORISED', color: '#065F46', bg: '#D1FAE5', icon: 'i-lucide-check' },
  'paid': { label: 'PAID', color: '#064E3B', bg: '#A7F3D0', icon: 'i-lucide-check-check' },
}

const statusDef = computed(() => STATUS_MAP[props.status || 'not_billed'] || STATUS_MAP['not_billed'])

const badgeStyle = computed(() => ({
  backgroundColor: statusDef.value.bg,
  color: statusDef.value.color,
}))
</script>
