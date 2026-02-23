<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    class="nb-button"
    :class="[
      variantClass,
      sizeClass,
      { 'nb-button-loading': loading },
      { 'w-full': block }
    ]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="nb-button-spinner">
      <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </span>
    <span v-else-if="icon" class="nb-button-icon">
      <UIcon :name="icon" class="w-4 h-4" />
    </span>
    <span class="nb-button-text">
      <slot />
    </span>
    <span v-if="trailingIcon" class="nb-button-icon-trailing">
      <UIcon :name="trailingIcon" class="w-4 h-4" />
    </span>
  </component>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'

interface Props {
  variant?: 'default' | 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  to?: string
  disabled?: boolean
  loading?: boolean
  icon?: string
  trailingIcon?: string
  block?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md'
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const variantClass = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'nb-button-primary'
    case 'secondary':
      return 'nb-button-secondary'
    case 'ghost':
      return 'nb-button-ghost'
    default:
      return ''
  }
})

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'nb-button-sm'
    case 'lg':
      return 'nb-button-lg'
    default:
      return ''
  }
})

function handleClick(event: MouseEvent) {
  if (!props.loading && !props.disabled) {
    emit('click', event)
  }
}
</script>

<style scoped>
.nb-button-sm {
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
}

.nb-button-lg {
  padding: 0.75rem 1.5rem;
  font-size: 0.9375rem;
}

.nb-button-loading {
  cursor: wait;
}

.nb-button-spinner {
  display: flex;
  align-items: center;
}

.nb-button-icon,
.nb-button-icon-trailing {
  display: flex;
  align-items: center;
}
</style>
