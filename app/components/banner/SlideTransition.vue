<script setup lang="ts">
import type { BannerSlide } from '~/types/banner-studio'

const props = defineProps<{ slide: BannerSlide, index: number }>()
const { apply } = useBannerSlides()
const { pauseTimeline } = useBannerTimeline()
const open = ref(false)
const type = ref('cut')
const duration = ref(0.5)
watch(open, (value) => {
  if (!value) return
  pauseTimeline()
  type.value = props.slide.transition ? 'fade' : 'cut'
  duration.value = props.slide.transition?.duration || 0.5
})
function save() {
  if (apply({ type: 'transition', index: props.index, duration: type.value === 'fade' ? Number(duration.value) : 0 })) open.value = false
}
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      :aria-label="`Transition after ${slide.name}`"
      :label="slide.transition ? `Fade · ${slide.transition.duration}s` : 'Add transition'"
      icon="i-lucide-between-horizontal-start"
      color="neutral"
      variant="outline"
      size="xs"
    />
    <template #content>
      <div class="@container w-64 space-y-3 p-3">
        <p class="text-sm font-semibold">
          Transition after {{ slide.name }}
        </p>
        <UFormField label="Transition">
          <USelect v-model="type" :items="[{ label: 'Cut', value: 'cut' }, { label: 'Fade through background', value: 'fade' }]" class="w-full" />
        </UFormField>
        <UFormField v-if="type === 'fade'" label="Duration (seconds)" help="Included in the slide timings. Short slides limit the fade length.">
          <UInput
            v-model="duration"
            type="number"
            :min="0.1"
            :max="5"
            :step="0.1"
            class="w-full"
          />
        </UFormField>
        <UButton
          label="Save transition"
          class="w-full justify-center"
          size="sm"
          @click="save"
        />
      </div>
    </template>
  </UPopover>
</template>
