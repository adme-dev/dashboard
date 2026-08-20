<template>
  <section
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
          class="marquee-track flex w-max gap-4"
          :class="rowIndex === 0 ? 'marquee-row-left' : 'marquee-row-right'"
          :data-paused="marqueePaused ? 'true' : undefined"
        >
          <div
            v-for="copyIndex in 2"
            :key="copyIndex"
            class="marquee-set flex shrink-0 gap-4"
            :aria-hidden="copyIndex === 2 ? 'true' : undefined"
          >
            <NuxtLink
              v-for="(card, cardIndex) in row"
              :key="`${copyIndex}-${card.to}-${cardIndex}`"
              :to="card.to"
              :tabindex="copyIndex === 2 ? -1 : undefined"
              class="group w-[250px] shrink-0 overflow-hidden rounded-[22px] transition-all duration-400 hover:-translate-y-1 hover:shadow-2xl sm:w-[280px]"
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
</script>

<style scoped>
@keyframes marquee-left {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(calc(-50% - 0.5rem), 0, 0); }
}

@keyframes marquee-right {
  from { transform: translate3d(calc(-50% - 0.5rem), 0, 0); }
  to { transform: translate3d(0, 0, 0); }
}

.marquee-track {
  will-change: transform;
}

.marquee-row-left {
  animation: marquee-left 60s linear infinite;
  animation-delay: -15s;
}

.marquee-row-right {
  animation: marquee-right 47s linear infinite;
  animation-delay: -10s;
}

.marquee-track[data-paused='true'] {
  animation-play-state: paused;
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
    animation: none;
    transform: none;
    will-change: auto;
  }

  .marquee-set[aria-hidden='true'] {
    display: none;
  }
}
</style>
