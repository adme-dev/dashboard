<template>
  <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    <!-- Ambient glow orbs -->
    <div
      v-for="(orb, i) in orbs"
      :key="i"
      class="absolute rounded-full"
      :class="orb.classes"
      :style="orb.style"
    />

    <!-- Abstract SVG mesh -->
    <svg class="absolute inset-0 w-full h-full opacity-[0.12]" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient :id="`grad-${theme}-1`" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" :stop-color="colors.grad1[0]" />
          <stop offset="100%" :stop-color="colors.grad1[1]" />
        </linearGradient>
        <linearGradient :id="`grad-${theme}-2`" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" :stop-color="colors.grad2[0]" />
          <stop offset="100%" :stop-color="colors.grad2[1]" />
        </linearGradient>
        <linearGradient :id="`grad-${theme}-3`" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" :stop-color="colors.grad3[0]" />
          <stop offset="100%" :stop-color="colors.grad3[1]" />
        </linearGradient>
      </defs>
      <!-- Flowing curves -->
      <path d="M0,300 Q200,100 500,250 T1000,200 T1500,350 T2000,150" fill="none" :stroke="`url(#grad-${theme}-1)`" stroke-width="1.5" opacity="0.6">
        <animate attributeName="d" dur="20s" repeatCount="indefinite" values="M0,300 Q200,100 500,250 T1000,200 T1500,350 T2000,150;M0,250 Q300,350 600,200 T1100,300 T1600,180 T2000,280;M0,300 Q200,100 500,250 T1000,200 T1500,350 T2000,150" />
      </path>
      <path d="M0,500 Q350,350 700,480 T1300,380 T1800,500" fill="none" :stroke="`url(#grad-${theme}-2)`" stroke-width="1" opacity="0.5">
        <animate attributeName="d" dur="25s" repeatCount="indefinite" values="M0,500 Q350,350 700,480 T1300,380 T1800,500;M0,450 Q250,550 650,400 T1200,520 T1800,420;M0,500 Q350,350 700,480 T1300,380 T1800,500" />
      </path>
      <path d="M0,650 Q400,500 800,620 T1400,550 T2000,680" fill="none" :stroke="`url(#grad-${theme}-3)`" stroke-width="0.8" opacity="0.4">
        <animate attributeName="d" dur="30s" repeatCount="indefinite" values="M0,650 Q400,500 800,620 T1400,550 T2000,680;M0,700 Q300,600 750,700 T1350,600 T2000,620;M0,650 Q400,500 800,620 T1400,550 T2000,680" />
      </path>
      <!-- Geometric accents -->
      <circle cx="15%" cy="25%" r="80" fill="none" :stroke="`url(#grad-${theme}-1)`" stroke-width="0.5" opacity="0.3">
        <animate attributeName="r" dur="12s" repeatCount="indefinite" values="80;95;80" />
      </circle>
      <circle cx="80%" cy="35%" r="60" fill="none" :stroke="`url(#grad-${theme}-2)`" stroke-width="0.5" opacity="0.25">
        <animate attributeName="r" dur="15s" repeatCount="indefinite" values="60;75;60" />
      </circle>
      <circle cx="60%" cy="70%" r="100" fill="none" :stroke="`url(#grad-${theme}-3)`" stroke-width="0.5" opacity="0.2">
        <animate attributeName="r" dur="18s" repeatCount="indefinite" values="100;120;100" />
      </circle>
      <!-- Dot grid -->
      <g opacity="0.15">
        <circle v-for="dot in heroDots" :key="`${dot.cx}-${dot.cy}`" :cx="dot.cx" :cy="dot.cy" r="1.5" fill="white" />
      </g>
    </svg>

    <!-- Noise texture overlay -->
    <div class="absolute inset-0 opacity-[0.03]" :style="{ backgroundImage: noiseUrl }" />

    <!-- Gradient fade at bottom -->
    <div class="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0b0e] to-transparent" />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  theme: 'creativity' | 'pricing' | 'features' | 'feature-detail' | 'about' | 'support' | 'legal'
}>()

interface ThemeColors {
  grad1: [string, string]
  grad2: [string, string]
  grad3: [string, string]
  orbs: string[]
}

const THEMES: Record<string, ThemeColors> = {
  creativity: {
    grad1: ['#8b5cf6', '#6366f1'], // violet → indigo
    grad2: ['#10b981', '#14b8a6'], // emerald → teal
    grad3: ['#f59e0b', '#f97316'], // amber → orange
    orbs: ['bg-violet-500/[0.08]', 'bg-emerald-500/[0.06]', 'bg-amber-500/[0.05]', 'bg-blue-500/[0.05]', 'bg-rose-500/[0.04]']
  },
  pricing: {
    grad1: ['#10b981', '#14b8a6'], // emerald → teal
    grad2: ['#06b6d4', '#0ea5e9'], // cyan → sky
    grad3: ['#84cc16', '#22c55e'], // lime → green
    orbs: ['bg-emerald-500/[0.08]', 'bg-cyan-500/[0.06]', 'bg-lime-500/[0.05]', 'bg-teal-500/[0.05]', 'bg-green-500/[0.04]']
  },
  features: {
    grad1: ['#3b82f6', '#6366f1'], // blue → indigo
    grad2: ['#8b5cf6', '#a855f7'], // violet → purple
    grad3: ['#06b6d4', '#0ea5e9'], // cyan → sky
    orbs: ['bg-blue-500/[0.08]', 'bg-violet-500/[0.06]', 'bg-cyan-500/[0.05]', 'bg-indigo-500/[0.05]', 'bg-sky-500/[0.04]']
  },
  'feature-detail': {
    grad1: ['#6366f1', '#3b82f6'], // indigo → blue
    grad2: ['#0ea5e9', '#06b6d4'], // sky → cyan
    grad3: ['#8b5cf6', '#d946ef'], // violet → fuchsia
    orbs: ['bg-indigo-500/[0.08]', 'bg-sky-500/[0.06]', 'bg-violet-500/[0.05]', 'bg-blue-500/[0.05]', 'bg-cyan-500/[0.04]']
  },
  about: {
    grad1: ['#f59e0b', '#f97316'], // amber → orange
    grad2: ['#f43f5e', '#ec4899'], // rose → pink
    grad3: ['#8b5cf6', '#6366f1'], // violet → indigo
    orbs: ['bg-amber-500/[0.08]', 'bg-rose-500/[0.06]', 'bg-violet-500/[0.05]', 'bg-orange-500/[0.05]', 'bg-pink-500/[0.04]']
  },
  support: {
    grad1: ['#14b8a6', '#10b981'], // teal → emerald
    grad2: ['#0ea5e9', '#3b82f6'], // sky → blue
    grad3: ['#06b6d4', '#14b8a6'], // cyan → teal
    orbs: ['bg-teal-500/[0.08]', 'bg-sky-500/[0.06]', 'bg-cyan-500/[0.05]', 'bg-emerald-500/[0.05]', 'bg-blue-500/[0.04]']
  },
  legal: {
    grad1: ['#64748b', '#71717a'], // slate → zinc
    grad2: ['#9ca3af', '#64748b'], // gray → slate
    grad3: ['#71717a', '#a3a3a3'], // zinc → neutral
    orbs: ['bg-slate-500/[0.06]', 'bg-gray-500/[0.04]', 'bg-zinc-500/[0.03]', 'bg-slate-400/[0.03]', 'bg-gray-400/[0.02]']
  }
}

const colors = computed(() => THEMES[props.theme] || THEMES.creativity)

const ORB_POSITIONS = [
  { pos: 'top-1/3 left-1/4', size: 'w-[600px] h-[600px]', blur: 'blur-[140px]' },
  { pos: 'bottom-1/4 right-1/4', size: 'w-[500px] h-[500px]', blur: 'blur-[120px]' },
  { pos: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2', size: 'w-[400px] h-[400px]', blur: 'blur-[100px]' },
  { pos: 'top-[15%] right-[10%]', size: 'w-[350px] h-[350px]', blur: 'blur-[120px]' },
  { pos: 'bottom-[10%] left-[15%]', size: 'w-[300px] h-[300px]', blur: 'blur-[100px]' }
]

const orbs = computed(() =>
  ORB_POSITIONS.map((p, i) => ({
    classes: `${p.pos} ${p.size} ${p.blur} ${colors.value.orbs[i] || ''}`,
    style: {}
  }))
)

// Static hex-pattern dot grid
const heroDots = (() => {
  const dots: { cx: string; cy: string }[] = []
  for (let x = 5; x <= 95; x += 5) {
    for (let y = 10; y <= 90; y += 8) {
      const offsetX = y % 16 === 0 ? 2.5 : 0
      dots.push({ cx: `${x + offsetX}%`, cy: `${y}%` })
    }
  }
  return dots
})()

const noiseUrl = `url(data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/></filter><rect width="200" height="200" filter="url(#n)" opacity="1"/></svg>')})`
</script>
