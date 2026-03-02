<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'
import { FORMATS, migrateLayer } from '~/utils/banner-constants'

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { state, nextId } = useBannerStudio()

const url = ref('')
const isLoading = ref(false)
const isScraping = ref(false)
const scraped = ref<any>(null)
const editHeadline = ref('')
const editSubheadline = ref('')
const editCta = ref('')
const selectedFormats = ref<string[]>([])

// Pre-fill selected formats from current banner set
watch(open, (val) => {
  if (val) {
    selectedFormats.value = [...state.setKeys]
    scraped.value = null
    url.value = ''
    editHeadline.value = ''
    editSubheadline.value = ''
    editCta.value = ''
  }
})

const availableFormats = computed(() =>
  Object.values(FORMATS).map(f => ({
    label: f.label,
    value: f.key,
  }))
)

async function handleScrape() {
  if (!url.value.trim()) return
  isScraping.value = true
  scraped.value = null

  try {
    const result = await $fetch('/api/agency/banner-studio/generate-from-url', {
      method: 'POST',
      body: { url: url.value, formats: selectedFormats.value },
    })
    scraped.value = result
    // Pre-fill editable fields from first layout's content
    const firstLayout = Object.values(result.layouts)[0] as any
    if (firstLayout) {
      const headlineLayer = firstLayout.layers.find((l: any) => l.name === 'Headline')
      const subLayer = firstLayout.layers.find((l: any) => l.name === 'Subheadline')
      const ctaLayer = firstLayout.layers.find((l: any) => l.name === 'CTA')
      editHeadline.value = headlineLayer?.text || result.scraped.headline || ''
      editSubheadline.value = subLayer?.text || result.scraped.description || ''
      editCta.value = ctaLayer?.text || result.scraped.ctaTexts?.[0] || 'Learn More'
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.data?.statusMessage || 'Failed to scrape URL', color: 'error' })
  } finally {
    isScraping.value = false
  }
}

function handleGenerate() {
  if (!scraped.value?.layouts) return
  isLoading.value = true

  try {
    const layouts = scraped.value.layouts as Record<string, { layers: Partial<Layer>[] }>

    // Replace sets with generated layouts
    state.sets = {}
    state.setKeys = []

    for (const [key, layout] of Object.entries(layouts)) {
      const fmt = FORMATS[key]
      if (!fmt) continue

      // Override text with user-edited values
      const layers = layout.layers.map((l: Partial<Layer>) => {
        const patched = { ...l }
        if (patched.name === 'Headline') patched.text = editHeadline.value.toUpperCase()
        if (patched.name === 'Subheadline') patched.text = editSubheadline.value
        if (patched.name === 'CTA') patched.text = editCta.value.toUpperCase()
        return migrateLayer({ ...patched, id: nextId() })
      })

      state.sets[key] = { layers }
      state.setKeys.push(key)
    }

    state.activeKey = state.setKeys[0] || ''
    state.selectedLayerId = null
    state.isDirty = true
    toast.add({ title: 'Generated', description: `${Object.keys(layouts).length} artboards created from URL`, color: 'success' })
    open.value = false
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <div class="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-lucide-globe" class="text-(--ui-primary) w-5 h-5" />
          <h3 class="text-base font-bold">Generate from URL</h3>
        </div>

        <!-- URL Input -->
        <div>
          <label class="text-xs text-(--ui-text-muted) mb-1 block">Website URL</label>
          <div class="flex gap-2">
            <UInput
              v-model="url"
              size="sm"
              class="flex-1"
              placeholder="https://example.com/landing-page"
              @keydown.enter="handleScrape"
            />
            <UButton
              label="Scrape"
              icon="i-lucide-search"
              size="sm"
              :loading="isScraping"
              :disabled="!url.trim()"
              @click="handleScrape"
            />
          </div>
        </div>

        <!-- Format selection -->
        <div>
          <label class="text-xs text-(--ui-text-muted) mb-1 block">Sizes to generate</label>
          <div class="flex flex-wrap gap-1">
            <UButton
              v-for="fmt in availableFormats"
              :key="fmt.value"
              size="xs"
              :variant="selectedFormats.includes(fmt.value) ? 'solid' : 'outline'"
              @click="selectedFormats.includes(fmt.value) ? selectedFormats.splice(selectedFormats.indexOf(fmt.value), 1) : selectedFormats.push(fmt.value)"
            >
              {{ fmt.label.split(' · ')[0] }}
            </UButton>
          </div>
        </div>

        <!-- Scraped preview -->
        <template v-if="scraped">
          <div class="border border-(--ui-border) rounded-lg p-3 space-y-3">
            <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted)">Scraped Content</div>

            <!-- OG Image preview -->
            <div v-if="scraped.assetUrls?.length" class="flex gap-2">
              <img
                v-for="(imgUrl, i) in scraped.assetUrls.slice(0, 3)"
                :key="i"
                :src="imgUrl"
                class="w-20 h-14 object-cover rounded border border-(--ui-border)"
              />
            </div>

            <!-- Brand -->
            <div v-if="scraped.scraped.brandName" class="text-xs text-(--ui-text-muted)">
              Brand: <span class="text-(--ui-text) font-medium">{{ scraped.scraped.brandName }}</span>
            </div>

            <!-- Detected CTAs -->
            <div v-if="scraped.scraped.ctaTexts?.length" class="text-xs text-(--ui-text-muted)">
              CTAs found:
              <UBadge v-for="cta in scraped.scraped.ctaTexts" :key="cta" variant="subtle" size="xs" class="ml-1">{{ cta }}</UBadge>
            </div>

            <!-- Detected colors -->
            <div v-if="scraped.scraped.primaryColors?.length" class="flex items-center gap-1 text-xs text-(--ui-text-muted)">
              Colors:
              <span
                v-for="c in scraped.scraped.primaryColors"
                :key="c"
                class="w-4 h-4 rounded-full border border-(--ui-border) inline-block"
                :style="{ backgroundColor: c }"
                :title="c"
              />
            </div>
          </div>

          <!-- Editable copy -->
          <div class="space-y-2">
            <div class="text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted)">Ad Copy</div>
            <div>
              <label class="text-xs text-(--ui-text-muted)">Headline</label>
              <UInput v-model="editHeadline" size="sm" />
            </div>
            <div>
              <label class="text-xs text-(--ui-text-muted)">Subheadline</label>
              <UInput v-model="editSubheadline" size="sm" />
            </div>
            <div>
              <label class="text-xs text-(--ui-text-muted)">CTA</label>
              <UInput v-model="editCta" size="sm" />
            </div>
          </div>

          <!-- Generate button -->
          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancel" variant="ghost" size="sm" @click="open = false" />
            <UButton
              label="Generate Banners"
              icon="i-lucide-wand-2"
              size="sm"
              :loading="isLoading"
              :disabled="!selectedFormats.length"
              @click="handleGenerate"
            />
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
