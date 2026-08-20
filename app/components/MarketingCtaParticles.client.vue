<template>
  <div
    data-marketing-cta-particles
    class="absolute inset-0 -z-10 overflow-hidden pointer-events-none"
    :style="rootStyle"
    aria-hidden="true"
  >
    <div
      v-for="(layer, layerIndex) in particleLayers"
      :key="layerIndex"
      class="marketing-cta-particle-wave absolute inset-0"
      :class="`marketing-cta-particle-wave-${layerIndex + 1}`"
    >
      <span
        v-for="dot in layer"
        :key="dot.id"
        class="absolute rounded-full"
        :style="dot.style"
      />
    </div>

    <div class="marketing-cta-glow marketing-cta-glow-primary absolute left-[14%] top-[-24%] h-[560px] w-[560px] rounded-full" />
    <div class="marketing-cta-glow marketing-cta-glow-secondary absolute bottom-[-36%] right-[18%] h-[460px] w-[460px] rounded-full" />
  </div>
</template>

<script setup lang="ts">
type CtaParticleTheme = 'amber' | 'blue' | 'cyan' | 'emerald' | 'fuchsia' | 'indigo' | 'rose' | 'violet'

type Particle = {
  id: string
  style: Record<string, string | number>
}

const props = withDefaults(defineProps<{ theme?: CtaParticleTheme }>(), {
  theme: 'emerald'
})

const palettes: Record<CtaParticleTheme, { dots: string[], glow: string }> = {
  amber: { dots: ['#fbbf24', '#f59e0b', '#fcd34d', '#fb923c', '#fde68a'], glow: '245 158 11' },
  blue: { dots: ['#60a5fa', '#38bdf8', '#3b82f6', '#93c5fd', '#22d3ee'], glow: '59 130 246' },
  cyan: { dots: ['#22d3ee', '#67e8f9', '#06b6d4', '#a5f3fc', '#38bdf8'], glow: '6 182 212' },
  emerald: { dots: ['#34d399', '#6ee7b7', '#10b981', '#a7f3d0', '#059669'], glow: '16 185 129' },
  fuchsia: { dots: ['#e879f9', '#f0abfc', '#d946ef', '#f472b6', '#c026d3'], glow: '217 70 239' },
  indigo: { dots: ['#818cf8', '#a5b4fc', '#6366f1', '#c7d2fe', '#8b5cf6'], glow: '99 102 241' },
  rose: { dots: ['#fb7185', '#f472b6', '#e11d48', '#fda4af', '#be123c'], glow: '244 63 94' },
  violet: { dots: ['#a78bfa', '#c4b5fd', '#8b5cf6', '#e879f9', '#7c3aed'], glow: '139 92 246' }
}

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

function themeSeed(theme: string) {
  return [...theme].reduce((seed, character) => ((seed * 31) + character.charCodeAt(0)) >>> 0, 2166136261)
}

function makeLayer(layerIndex: number, count: number): Particle[] {
  const palette = palettes[props.theme].dots
  const random = seededRandom(themeSeed(props.theme) + layerIndex * 997)
  const ranges = [
    { x: [7, 68], y: [8, 88], size: [2, 5.5], opacity: [0.28, 0.78] },
    { x: [18, 84], y: [4, 94], size: [1.5, 4.5], opacity: [0.2, 0.62] },
    { x: [12, 76], y: [15, 83], size: [1.5, 4], opacity: [0.24, 0.68] }
  ][layerIndex]

  return Array.from({ length: count }, (_, index) => {
    const x = ranges.x[0] + random() * (ranges.x[1] - ranges.x[0])
    const y = ranges.y[0] + random() * (ranges.y[1] - ranges.y[0])
    const size = ranges.size[0] + random() * (ranges.size[1] - ranges.size[0])
    const opacity = ranges.opacity[0] + random() * (ranges.opacity[1] - ranges.opacity[0])

    return {
      id: `${layerIndex}-${index}`,
      style: {
        left: `${x.toFixed(2)}%`,
        top: `${y.toFixed(2)}%`,
        width: `${size.toFixed(2)}px`,
        height: `${size.toFixed(2)}px`,
        backgroundColor: palette[Math.floor(random() * palette.length)],
        opacity: opacity.toFixed(2)
      }
    }
  })
}

const particleLayers = computed(() => [
  makeLayer(0, 35),
  makeLayer(1, 30),
  makeLayer(2, 25)
])

const rootStyle = computed(() => ({
  '--marketing-cta-glow': palettes[props.theme].glow
}))
</script>

<style scoped>
[data-marketing-cta-particles] {
  contain: layout paint;
}

.marketing-cta-particle-wave {
  transform-origin: 40% 50%;
  will-change: transform;
}

.marketing-cta-particle-wave-1 {
  animation: marketing-cta-wave-drift-1 20s ease-in-out infinite;
}

.marketing-cta-particle-wave-2 {
  animation: marketing-cta-wave-drift-2 16s ease-in-out infinite;
}

.marketing-cta-particle-wave-3 {
  animation: marketing-cta-wave-drift-3 12s ease-in-out infinite;
}

.marketing-cta-glow {
  background: rgb(var(--marketing-cta-glow) / 0.08);
  filter: blur(110px);
  will-change: opacity, transform;
}

.marketing-cta-glow-primary {
  animation: marketing-cta-glow-pulse-1 8s ease-in-out infinite;
}

.marketing-cta-glow-secondary {
  animation: marketing-cta-glow-pulse-2 10s ease-in-out infinite;
}

@keyframes marketing-cta-wave-drift-1 {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
  25% { transform: translate3d(30px, -20px, 0) rotate(8deg); }
  50% { transform: translate3d(-10px, 15px, 0) rotate(-4deg); }
  75% { transform: translate3d(20px, 10px, 0) rotate(5deg); }
}

@keyframes marketing-cta-wave-drift-2 {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
  25% { transform: translate3d(-25px, 15px, 0) rotate(-6deg); }
  50% { transform: translate3d(20px, -25px, 0) rotate(7deg); }
  75% { transform: translate3d(-15px, -10px, 0) rotate(-3deg); }
}

@keyframes marketing-cta-wave-drift-3 {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
  33% { transform: translate3d(20px, 20px, 0) rotate(10deg); }
  66% { transform: translate3d(-20px, -15px, 0) rotate(-8deg); }
}

@keyframes marketing-cta-glow-pulse-1 {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}

@keyframes marketing-cta-glow-pulse-2 {
  0%, 100% { opacity: 0.5; transform: scale(1.1); }
  50% { opacity: 0.8; transform: scale(0.9); }
}

@media (prefers-reduced-motion: reduce) {
  .marketing-cta-particle-wave,
  .marketing-cta-glow {
    animation: none;
  }
}
</style>
