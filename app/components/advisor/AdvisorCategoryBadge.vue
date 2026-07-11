<script setup lang="ts">
import { CATEGORY_LABELS, type Category } from '~~/server/utils/advisorCategories'

const props = defineProps<{
  category: Category | string | null
  size?: 'xs' | 'sm' | 'md'
}>()

type UiColor = 'error' | 'info' | 'success' | 'primary' | 'secondary' | 'warning' | 'neutral'

const COLOR_MAP: Record<Category, UiColor> = {
  cashflow: 'primary',
  collections: 'warning',
  pricing: 'info',
  margin: 'success',
  'cost-control': 'neutral',
  growth: 'success',
  staffing: 'info',
  'tax-compliance': 'warning',
  risk: 'error',
}

const color = computed(() => {
  if (!props.category) return 'neutral'
  return (COLOR_MAP as Record<string, UiColor>)[props.category] ?? 'neutral'
})

const label = computed(() => {
  if (!props.category) return 'Uncategorized'
  return (CATEGORY_LABELS as Record<string, string>)[props.category] ?? props.category
})
</script>

<template>
  <UBadge :color="color" variant="subtle" :size="size ?? 'sm'">
    {{ label }}
  </UBadge>
</template>
