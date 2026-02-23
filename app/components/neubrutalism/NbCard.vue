<template>
  <div 
    class="nb-card"
    :class="[
      variantClass,
      { 'nb-card-hover': hoverable },
      { 'nb-card-elevated': elevated }
    ]"
  >
    <div v-if="$slots.header || title" class="nb-card-header">
      <slot name="header">
        <h3 class="nb-text-card-title">{{ title }}</h3>
      </slot>
    </div>
    <div class="nb-card-body" :class="bodyClass">
      <slot />
    </div>
    <div v-if="$slots.footer" class="nb-card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title?: string
  hoverable?: boolean
  elevated?: boolean
  variant?: 'default' | 'primary' | 'secondary'
  bodyClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  hoverable: false,
  elevated: false
})

const variantClass = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'nb-card-elevated'
    case 'secondary':
      return 'nb-card-secondary'
    default:
      return ''
  }
})
</script>

<style scoped>
.nb-card-secondary {
  box-shadow: 
    4px 4px 0 0 var(--nb-accent-yellow),
    8px 8px var(--nb-shadow-blur) calc(var(--nb-shadow-blur) * -0.5) rgba(255, 230, 109, 0.15);
}

.nb-card-secondary.nb-card-hover:hover {
  box-shadow: 
    6px 6px 0 0 var(--nb-accent-yellow),
    12px 12px 32px -8px rgba(255, 230, 109, 0.2);
}
</style>
