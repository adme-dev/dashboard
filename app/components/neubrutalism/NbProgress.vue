<template>
  <div class="nb-progress-wrapper">
    <div v-if="label || $slots.label" class="nb-progress-label">
      <slot name="label">
        <span class="nb-text-label">{{ label }}</span>
        <span v-if="showValue" class="nb-progress-value">{{ Math.round(progress) }}%</span>
      </slot>
    </div>
    <div class="nb-progress" :class="{ 'nb-progress-indeterminate': indeterminate }">
      <div 
        class="nb-progress-bar" 
        :class="variantClass"
        :style="{ width: indeterminate ? '30%' : `${progress}%` }"
      ></div>
    </div>
    <div v-if="$slots.caption || caption" class="nb-progress-caption">
      <slot name="caption">
        <span class="nb-text-small">{{ caption }}</span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  progress?: number
  variant?: 'default' | 'success' | 'warning' | 'error'
  label?: string
  caption?: string
  showValue?: boolean
  indeterminate?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  progress: 0,
  variant: 'default',
  showValue: false,
  indeterminate: false
})

const variantClass = computed(() => {
  switch (props.variant) {
    case 'success':
      return 'nb-progress-bar-success'
    case 'warning':
      return 'nb-progress-bar-warning'
    case 'error':
      return 'nb-progress-bar-error'
    default:
      return ''
  }
})
</script>

<style scoped>
.nb-progress-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.nb-progress-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nb-progress-value {
  font-family: var(--nb-font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--nb-text-secondary);
}

.nb-progress {
  width: 100%;
  height: 10px;
  background: var(--nb-bg-elevated);
  border: 2px solid var(--nb-border-strong);
  border-radius: var(--nb-radius);
  overflow: hidden;
  position: relative;
}

.nb-progress-bar {
  height: 100%;
  background: var(--nb-accent-red);
  border-right: 2px solid var(--nb-border-strong);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.nb-progress-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  opacity: 0.1;
  pointer-events: none;
}

.nb-progress-bar-success {
  background: var(--nb-accent-teal);
}

.nb-progress-bar-warning {
  background: var(--nb-accent-yellow);
}

.nb-progress-bar-error {
  background: var(--nb-accent-red);
}

.nb-progress-indeterminate .nb-progress-bar {
  animation: nb-progress-indeterminate 1.5s ease-in-out infinite;
}

@keyframes nb-progress-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(300%);
  }
  100% {
    transform: translateX(-100%);
  }
}
</style>
