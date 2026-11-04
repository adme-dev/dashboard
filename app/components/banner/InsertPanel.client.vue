<script setup lang="ts">
import type { BannerMediaType } from '~/utils/banner-media'
import { motorstackBrandId } from '~~/shared/bannerBrandGuides'
import { brandStyleProfile } from '~~/shared/bannerBrandProfiles'
import type { BrandButtonVariant } from '~/utils/banner-brand-kit'

const { insertElement } = useBannerInsert()
const { addBrandGuideButton } = useBannerStudio()
const { kit, loading: kitLoading, error: kitError, refresh: refreshKits } = useBannerProjectBrand()
const toast = useToast()
const emit = defineEmits<{ browseBrand: [tab: 'logos' | 'variants' | 'offers'] }>()
const brandId = computed(() => motorstackBrandId(kit.value?.sourceUrl))
const hasButtonPresets = computed(() => !!kit.value?.id && !!brandStyleProfile(brandId.value))
const view = ref<BannerMediaType | 'home' | 'elements' | 'buttons'>('home')
const assetsPanel = ref<{ openUpload: () => void, openMotorStack: () => void }>()
const categories = [
  { label: 'Images', icon: 'i-lucide-image', value: 'image' },
  { label: 'Videos', icon: 'i-lucide-video', value: 'video' },
  { label: 'Audio tracks', icon: 'i-lucide-music', value: 'audio' }
] as const

async function upload() {
  view.value = 'all'
  await nextTick()
  assetsPanel.value?.openUpload()
}
async function motorstack() {
  view.value = 'image'
  await nextTick()
  assetsPanel.value?.openMotorStack()
}
function addStyleButton(variant: BrandButtonVariant) {
  if (!kit.value || !addBrandGuideButton(kit.value, variant)) return
  toast.add({ title: 'Brand button added', description: 'Edit its label in the inspector.', color: 'success' })
}
</script>

<template>
  <section aria-label="Insert panel" class="@container min-w-0">
    <div class="flex items-center gap-2 p-3 border-b border-default">
      <UButton
        v-if="view !== 'home'"
        icon="i-lucide-arrow-left"
        aria-label="Back to insert"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="() => { view = 'home' }"
      />
      <h2 class="text-sm font-semibold">
        {{ view === 'home' ? 'Insert' : view === 'buttons' ? 'Buttons' : view === 'elements' ? 'Shapes & elements' : view === 'all' ? 'Media library' : categories.find(item => item.value === view)?.label }}
      </h2>
    </div>
    <div v-if="view === 'home'" class="p-3 space-y-4">
      <UButton
        label="Upload media"
        icon="i-lucide-upload"
        color="neutral"
        variant="outline"
        class="w-full justify-center py-5"
        @click="upload"
      />
      <div class="grid grid-cols-3 gap-1.5">
        <UButton
          v-for="item in [{ label: 'Text', type: 'text', icon: 'i-lucide-type' }, { label: 'Shape', type: 'rect', icon: 'i-lucide-shapes' }, { label: 'Button', type: 'button', icon: 'i-lucide-mouse-pointer-click' }]"
          :key="item.type"
          variant="soft"
          color="neutral"
          class="flex-col justify-center gap-1 py-3 text-xs"
          @click="item.type === 'button' ? view = 'buttons' : insertElement(item.type)"
        >
          <UIcon :name="item.icon" class="size-5" />{{ item.label }}
        </UButton>
      </div>
      <div class="space-y-2 border-t border-default pt-4">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-semibold text-highlighted">
            Brand resources
          </h3>
          <span v-if="kit" class="truncate text-[11px] text-muted">{{ kit.name }}</span>
        </div>
        <BannerBrandStyleGuide
          v-if="hasButtonPresets && kit"
          :kit="kit"
          compact
          interactive
          @add-button="addStyleButton"
        />
        <p v-else class="text-xs leading-relaxed text-muted">
          {{ kit ? 'This kit has no reviewed button presets yet. Its logos, colours and fonts are ready in Brand.' : 'Choose a brand kit to load its saved design resources.' }}
        </p>
        <UButton
          :label="kit ? 'Logos, colours & fonts' : 'Choose a brand kit'"
          icon="i-lucide-swatch-book"
          color="neutral"
          variant="outline"
          size="sm"
          class="w-full justify-start"
          @click="emit('browseBrand', 'logos')"
        />
        <div v-if="brandId" class="grid grid-cols-1 gap-2 @lg:grid-cols-2">
          <UButton
            label="Vehicle images"
            icon="i-lucide-car-front"
            color="neutral"
            variant="outline"
            size="sm"
            class="justify-center"
            @click="emit('browseBrand', 'variants')"
          />
          <UButton
            label="Offer artwork"
            icon="i-lucide-tags"
            color="neutral"
            variant="outline"
            size="sm"
            class="justify-center"
            @click="emit('browseBrand', 'offers')"
          />
        </div>
      </div>
      <div class="space-y-1">
        <UButton
          v-for="item in categories"
          :key="item.value"
          :label="item.label"
          :icon="item.icon"
          variant="ghost"
          color="neutral"
          class="w-full py-3"
          @click="() => { view = item.value }"
        />
        <UButton
          label="MotorStack media"
          icon="i-lucide-car"
          variant="ghost"
          color="neutral"
          class="w-full py-3"
          @click="motorstack"
        />
        <UButton
          label="Shapes & elements"
          icon="i-lucide-shapes"
          variant="ghost"
          color="neutral"
          class="w-full py-3"
          @click="() => { view = 'elements' }"
        />
        <UButton
          label="Mask"
          icon="i-lucide-scan"
          variant="ghost"
          color="neutral"
          class="w-full py-3"
          @click="insertElement('mask')"
        />
      </div>
      <p class="text-xs text-muted leading-relaxed">
        Choose media to add it to the current slide. Use the image properties to replace or crop it.
      </p>
    </div>
    <div v-else-if="view === 'buttons'" class="space-y-4 p-3">
      <div v-if="kitLoading" role="status" class="flex items-center gap-2 py-4 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />Loading brand buttons…
      </div>
      <template v-else-if="kitError">
        <UAlert
          title="Could not load brand buttons"
          description="Retry to load your style guide presets."
          color="error"
          variant="soft"
        />
        <UButton
          label="Retry"
          color="neutral"
          variant="outline"
          @click="() => refreshKits()"
        />
      </template>
      <template v-else>
        <p class="text-xs leading-relaxed text-muted">
          {{ hasButtonPresets ? 'Choose a style guide preset. Click to add it, or drag it onto a canvas. Its text stays editable.' : kit ? 'This kit has no button presets yet. You can create a button using its colours and fonts.' : 'Choose a brand kit to see its style guide buttons, or start with a custom button.' }}
        </p>
        <BannerBrandStyleGuide
          v-if="hasButtonPresets && kit"
          :kit="kit"
          compact
          interactive
          @add-button="addStyleButton"
        />
        <UButton
          v-else
          label="Add custom button"
          icon="i-lucide-mouse-pointer-click"
          color="neutral"
          variant="outline"
          class="w-full justify-center"
          @click="insertElement('button')"
        />
        <UButton
          :label="kit ? 'Change brand kit' : 'Choose a brand kit'"
          icon="i-lucide-swatch-book"
          color="neutral"
          variant="ghost"
          class="w-full justify-start"
          @click="emit('browseBrand', 'logos')"
        />
      </template>
    </div>
    <BannerElementsPanel v-else-if="view === 'elements'" />
    <BannerAssetsPanel
      v-else
      ref="assetsPanel"
      :key="view"
      :media-type="view"
    />
  </section>
</template>
