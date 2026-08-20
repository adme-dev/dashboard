<template>
  <section
    ref="marqueeRoot"
    class="relative overflow-hidden border-t border-black/[0.04] py-8 dark:border-white/[0.06]"
    aria-label="XeroFlow platform highlights"
  >
    <div class="marquee-motion-control mx-auto mb-3 flex max-w-[1200px] justify-end px-6">
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        :icon="marqueePaused ? 'i-lucide-play' : 'i-lucide-pause'"
        :aria-label="marqueePaused ? 'Resume scrolling cards' : 'Pause scrolling cards'"
        @click="marqueePaused = !marqueePaused"
      >
        {{ marqueePaused ? 'Resume motion' : 'Pause motion' }}
      </UButton>
    </div>

    <div class="flex flex-col gap-4">
      <div
        v-for="(row, rowIndex) in rows"
        :key="rowIndex"
        class="marquee-viewport overflow-hidden"
      >
        <div
          :ref="(element) => setRowRef(element as HTMLElement | null, rowIndex)"
          class="marquee-track flex w-max gap-4"
          :data-paused="marqueePaused ? 'true' : undefined"
        >
          <div
            v-for="(card, cardIndex) in row"
            :key="`${card.to}-${cardIndex}`"
            class="marquee-item shrink-0"
          >
            <NuxtLink
              :to="card.to"
              class="group block w-[250px] overflow-hidden rounded-[22px] transition-all duration-400 hover:-translate-y-1 hover:shadow-2xl sm:w-[280px]"
              :class="card.bg"
            >
              <div class="relative flex h-[220px] items-center justify-center">
                <MorphBlob
                  :seed="cardIndex + rowIndex * 50"
                  :animate="true"
                  class="aspect-square w-[80%] transition-transform duration-500 group-hover:scale-[1.06]"
                >
                  <img
                    :src="card.image"
                    :alt="card.title"
                    width="600"
                    height="600"
                    decoding="async"
                    class="h-full w-full object-cover"
                  >
                </MorphBlob>
              </div>
              <div class="px-4 pb-4 pt-3">
                <div class="text-[15px] font-bold tracking-[-0.01em] text-black">{{ card.title }}</div>
                <div class="line-clamp-1 text-[12px] leading-relaxed text-black/50">{{ card.subtitle }}</div>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type gsapType from 'gsap'

export interface MarketingMarqueeCard {
  title: string
  subtitle: string
  to: string
  bg: string
  image: string
}

defineProps<{
  rows: MarketingMarqueeCard[][]
}>()

const marqueePaused = ref(false)
const marqueeRoot = ref<HTMLElement | null>(null)
const rowRefs: HTMLElement[] = []
let loops: gsap.core.Timeline[] = []
let mediaContext: ReturnType<typeof gsapType.matchMedia> | null = null
let unmounted = false

type Gsap = typeof gsapType

interface HorizontalLoopConfig {
  paddingRight?: number
  reversed?: boolean
  snap?: number | false
  speed?: number
}

function setRowRef(element: HTMLElement | null, index: number) {
  if (element) rowRefs[index] = element
}

/**
 * GSAP's official seamless horizontal-loop pattern, trimmed to the continuous
 * marquee features used here. Items wrap individually and movement is stored
 * in xPercent so card width changes remain responsive.
 */
function horizontalLoop(items: HTMLElement[], config: HorizontalLoopConfig, gsap: Gsap) {
  const timeline = gsap.timeline({
    repeat: -1,
    defaults: { ease: 'none' },
    onReverseComplete: () => timeline.totalTime(timeline.rawTime() + timeline.duration() * 100)
  })

  if (!items.length) return timeline

  const widths: number[] = []
  const xPercents: number[] = []
  const startX = items[0].offsetLeft
  const pixelsPerSecond = (config.speed || 1) * 100
  const snap = config.snap === false
    ? (value: number) => value
    : gsap.utils.snap(config.snap || 1)

  gsap.set(items, {
    xPercent: (index, element) => {
      const width = widths[index] = Number.parseFloat(String(gsap.getProperty(element, 'width', 'px')))
      const x = Number.parseFloat(String(gsap.getProperty(element, 'x', 'px')))
      const xPercent = Number(gsap.getProperty(element, 'xPercent'))
      return xPercents[index] = snap(x / width * 100 + xPercent)
    }
  })
  gsap.set(items, { x: 0 })

  const lastItem = items.at(-1)!
  const lastIndex = items.length - 1
  const lastScaleX = Number(gsap.getProperty(lastItem, 'scaleX'))
  const totalWidth = lastItem.offsetLeft
    + xPercents[lastIndex] / 100 * widths[lastIndex]
    - startX
    + lastItem.offsetWidth * lastScaleX
    + (config.paddingRight || 0)

  items.forEach((item, index) => {
    const width = widths[index]
    const currentX = xPercents[index] / 100 * width
    const scaleX = Number(gsap.getProperty(item, 'scaleX'))
    const distanceToLoop = item.offsetLeft + currentX - startX + width * scaleX

    timeline
      .to(item, {
        xPercent: snap((currentX - distanceToLoop) / width * 100),
        duration: distanceToLoop / pixelsPerSecond
      }, 0)
      .fromTo(item, {
        xPercent: snap((currentX - distanceToLoop + totalWidth) / width * 100)
      }, {
        xPercent: xPercents[index],
        duration: (totalWidth - distanceToLoop) / pixelsPerSecond,
        immediateRender: false
      }, distanceToLoop / pixelsPerSecond)
  })

  timeline.progress(1, true).progress(0, true)

  if (config.reversed) {
    timeline.totalTime(timeline.rawTime() + timeline.duration() * 100)
    timeline.reverse()
  }

  return timeline
}

function syncPlayback() {
  loops.forEach((loop) => {
    if (marqueePaused.value) loop.pause()
    else loop.resume()
  })
}

watch(marqueePaused, syncPlayback)

onMounted(async () => {
  const { default: gsap } = await import('gsap')
  await nextTick()

  if (unmounted || !marqueeRoot.value || !window.matchMedia) return

  mediaContext = gsap.matchMedia(marqueeRoot.value)
  mediaContext.add({
    desktop: '(min-width: 640px)',
    mobile: '(max-width: 639px)',
    reduceMotion: '(prefers-reduced-motion: reduce)'
  }, (context) => {
    if (context.conditions?.reduceMotion) return

    loops = rowRefs.map((row, rowIndex) => {
      const items = gsap.utils.toArray<HTMLElement>(row.children)
      const loop = horizontalLoop(items, {
        paddingRight: 16,
        reversed: rowIndex === 1,
        snap: false,
        speed: 0.69
      }, gsap)

      loop.progress(rowIndex === 0 ? 0.24 : 0.16, true)
      return loop
    })

    syncPlayback()

    return () => {
      loops = []
    }
  })
})

onBeforeUnmount(() => {
  unmounted = true
  mediaContext?.revert()
  mediaContext = null
  loops = []
})
</script>

<style scoped>
.marquee-item {
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  .marquee-motion-control {
    display: none;
  }

  .marquee-viewport {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .marquee-viewport::-webkit-scrollbar {
    display: none;
  }

  .marquee-track {
    transform: none;
  }

  .marquee-item {
    transform: none !important;
    will-change: auto;
  }
}
</style>
