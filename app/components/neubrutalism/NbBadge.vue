<template>
  <span 
    class="nb-badge"
    :class="variantClass"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'success' | 'warning' | 'error' | 'neutral' | 'primary' | 'secondary'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'neutral'
})

const variantClass = computed(() => {
  switch (props.variant) {
    case 'success':
      return 'nb-badge-success'
    case 'warning':
      return 'nb-badge-warning'
    case 'error':
      return 'nb-badge-error'
    case 'primary':
      return 'nb-badge-primary'
    case 'secondary':
      return 'nb-badge-secondary'
    default:
      return 'nb-badge-neutral'
  }
})
</script>

<style scoped>
.nb-badge-primary {
  background: rgba(255, 107, 107, 0.1);
  border-color: var(--nb-accent-red);
  color: var(--nb-accent-red);
}

.nb-badge-secondary {
  background: rgba(255, 230, 109, 0.1);
  border-color: var(--nb-accent-yellow);
  color: #b39500;
}

[data-theme="dark"] .nb-badge-secondary,
.dark .nb-badge-secondary {
  color: var(--nb-accent-yellow);
}
</style>
