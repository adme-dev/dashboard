<template>
  <div
    ref="elementRef"
    class="nb-scroll-reveal"
    :class="{
      'is-visible': isVisible,
      [`reveal-${direction}`]: true,
      [`stagger-${stagger}`]: stagger > 0
    }"
    :style="style"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
interface Props {
  direction?: 'up' | 'down' | 'left' | 'right'
  distance?: number
  duration?: number
  delay?: number
  stagger?: number
  threshold?: number
  once?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  direction: 'up',
  distance: 40,
  duration: 600,
  delay: 0,
  stagger: 0,
  threshold: 0.1,
  once: true
})

const elementRef = ref<HTMLElement>()
const isVisible = ref(false)

const style = computed(() => ({
  '--reveal-distance': `${props.distance}px`,
  '--reveal-duration': `${props.duration}ms`,
  '--reveal-delay': `${props.delay}ms`,
  '--stagger-delay': `${props.stagger}ms`
}))

onMounted(() => {
  if (!elementRef.value) return
  
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isVisible.value = true
          if (props.once) {
            observer.unobserve(entry.target)
          }
        } else if (!props.once) {
          isVisible.value = false
        }
      })
    },
    {
      threshold: props.threshold,
      rootMargin: '0px 0px -50px 0px'
    }
  )
  
  observer.observe(elementRef.value)
  
  onUnmounted(() => {
    observer.disconnect()
  })
})
</script>

<style scoped>
.nb-scroll-reveal {
  opacity: 0;
  transition: 
    opacity var(--reveal-duration, 600ms) cubic-bezier(0.4, 0, 0.2, 1),
    transform var(--reveal-duration, 600ms) cubic-bezier(0.4, 0, 0.2, 1);
  transition-delay: var(--reveal-delay, 0ms);
}

/* Direction variants */
.nb-scroll-reveal.reveal-up {
  transform: translateY(var(--reveal-distance, 40px));
}

.nb-scroll-reveal.reveal-down {
  transform: translateY(calc(var(--reveal-distance, 40px) * -1));
}

.nb-scroll-reveal.reveal-left {
  transform: translateX(var(--reveal-distance, 40px));
}

.nb-scroll-reveal.reveal-right {
  transform: translateX(calc(var(--reveal-distance, 40px) * -1));
}

/* Visible state */
.nb-scroll-reveal.is-visible {
  opacity: 1;
  transform: translate(0, 0);
}

/* Stagger children */
.nb-scroll-reveal.stagger-1 > :deep(*) { transition-delay: calc(var(--reveal-delay, 0ms) + 100ms); }
.nb-scroll-reveal.stagger-2 > :deep(*) { transition-delay: calc(var(--reveal-delay, 0ms) + 200ms); }
.nb-scroll-reveal.stagger-3 > :deep(*) { transition-delay: calc(var(--reveal-delay, 0ms) + 300ms); }
.nb-scroll-reveal.stagger-4 > :deep(*) { transition-delay: calc(var(--reveal-delay, 0ms) + 400ms); }
.nb-scroll-reveal.stagger-5 > :deep(*) { transition-delay: calc(var(--reveal-delay, 0ms) + 500ms); }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .nb-scroll-reveal {
    transition: none;
    opacity: 1;
    transform: none;
  }
}
</style>
