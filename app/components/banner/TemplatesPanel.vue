<script setup lang="ts">
import type { BannerTemplateDB } from '~/types/banner-studio'
import { TEMPLATES, FORMATS, migrateLayer } from '~/utils/banner-constants'
import { motorstackBrandId } from '~~/shared/bannerBrandGuides'
import { chooseMotorstackPreview, type MotorstackPreviewCatalog } from '~/utils/banner-brand-preview-media'

const { loadTemplate, loadBrandTemplate, state } = useBannerStudio()
const { kit, kitId, brandKits } = useBannerProjectBrand()
const oemKits = computed(() => (brandKits.value || [])
  .filter(item => motorstackBrandId(item.sourceUrl))
  .sort((a, b) => a.name.localeCompare(b.name)))
const toast = useToast()
const router = useRouter()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string }) => Promise<T>

const previewStyles: Record<string, { bg: string; textColor: string; accent?: string }> = {
  automotive: { bg: '#0a0a10', textColor: '#fff', accent: '#e8c84a' },
  lifestyle: { bg: '#0c0810', textColor: '#fff', accent: '#e8c84a' },
  minimal: { bg: '#f5f0e8', textColor: '#1a1a1a' },
  'price-hero': { bg: '#08080e', textColor: '#e8c84a', accent: '#e8c84a' },
}

function applyTemplate(id: string) {
  loadTemplate(id)
  const tpl = TEMPLATES.find(t => t.id === id)
  toast.add({ title: 'Template applied', description: `${tpl?.name || id} loaded to all artboards`, color: 'success' })
}

const applyingBrandTemplate = ref(false)
async function applySelectedBrandTemplate(variant: 'hero' | 'dual-cta') {
  const selectedKit = kit.value
  if (!selectedKit || applyingBrandTemplate.value) return
  applyingBrandTemplate.value = true
  let vehicleImageUrl: string | null = null
  try {
    const brandId = motorstackBrandId(selectedKit.sourceUrl)
    if (brandId) {
      const catalog = await $fetch<MotorstackPreviewCatalog>('/api/agency/banner-studio/motorstack/media', { query: { brandId } })
      const selected = chooseMotorstackPreview(catalog)
      if (selected) {
        const imported = await $fetch<{ asset: { url: string } }>('/api/agency/banner-studio/motorstack/media', { method: 'POST', body: { brandId, assetId: selected.asset.id } })
        vehicleImageUrl = imported.asset.url
      }
    }
  } catch {
    toast.add({ title: 'Vehicle image unavailable', description: 'The brand layout will use its colour background.', color: 'warning' })
  } finally {
    loadBrandTemplate(selectedKit, variant, vehicleImageUrl)
    toast.add({ title: 'Brand template applied', description: `${selectedKit.name} layout loaded to all artboards. Undo to restore.`, color: 'success' })
    applyingBrandTemplate.value = false
  }
}

// DB templates
const dbTemplates = ref<BannerTemplateDB[]>([])

async function refreshDbTemplates() {
  dbTemplates.value = await apiFetch<BannerTemplateDB[]>('/api/agency/banner-studio/templates')
}

refreshDbTemplates()

async function applyDbTemplate(tpl: BannerTemplateDB) {
  if (!tpl.canvasData || !state.project) return

  // Increment usage count in background
  apiFetch(`/api/agency/banner-studio/templates/${tpl.id}/use`, { method: 'POST' }).catch(() => {})

  // Apply template canvas data to current artboards
  const canvasData = typeof tpl.canvasData === 'string' ? JSON.parse(tpl.canvasData) : tpl.canvasData

  // For each active artboard, apply matching format data from the template
  // or scale from the first available template format
  const templateKeys = Object.keys(canvasData)
  if (!templateKeys.length) return

  state.setKeys.forEach(key => {
    if (canvasData[key]) {
      // Direct match: use the template's artboard data
      state.sets[key] = JSON.parse(JSON.stringify(canvasData[key]))
      state.sets[key].layers = state.sets[key].layers.map((l: any) => migrateLayer(l))
    } else {
      // Scale from first template format
      const srcKey = templateKeys[0]
      const srcFmt = FORMATS[srcKey]
      const tgtFmt = FORMATS[key]
      if (!srcFmt || !tgtFmt) return

      const srcLayers = canvasData[srcKey].layers || []
      const sx = tgtFmt.w / srcFmt.w
      const sy = tgtFmt.h / srcFmt.h
      const scaled = srcLayers.map((l: any) => {
        const n = { ...JSON.parse(JSON.stringify(l)) }
        n.x = Math.round(l.x * sx)
        n.y = Math.round(l.y * sy)
        n.w = Math.round(l.w * sx)
        n.h = Math.round(l.h * sy)
        if (n.type === 'bg') { n.w = tgtFmt.w; n.h = tgtFmt.h }
        if (n.fontSize) n.fontSize = Math.max(7, Math.round(n.fontSize * Math.min(sx, sy)))
        return migrateLayer(n)
      })
      state.sets[key] = { layers: scaled }
    }
  })

  state.selectedLayerId = null
  state.isDirty = true
  toast.add({ title: 'Template applied', description: `"${tpl.name}" loaded to all artboards`, color: 'success' })
}
</script>

<template>
  <div class="p-3">
    <div class="mb-5">
      <h4 class="text-xs font-bold uppercase tracking-wider text-muted mb-2">Brand templates</h4>
      <p class="text-xs text-muted mb-3">Choose an OEM below or use the selected client kit to build editable layouts.</p>
      <div v-if="oemKits.length" class="mb-3 max-h-36 overflow-y-auto rounded-md border border-default p-2 flex flex-wrap gap-1.5" aria-label="OEM brand templates">
        <UButton
          v-for="brand in oemKits"
          :key="brand.id"
          :label="brand.name"
          size="xs"
          color="neutral"
          :variant="kitId === brand.id ? 'solid' : 'soft'"
          :disabled="applyingBrandTemplate"
          @click="kitId = brand.id"
        />
      </div>
      <div v-if="kit" class="grid grid-cols-2 gap-2">
        <UButton label="Hero + CTA" icon="i-lucide-panel-top" variant="soft" size="xs" block :loading="applyingBrandTemplate" @click="applySelectedBrandTemplate('hero')" />
        <UButton label="Two CTAs" icon="i-lucide-panels-top-left" variant="soft" size="xs" block :loading="applyingBrandTemplate" @click="applySelectedBrandTemplate('dual-cta')" />
      </div>
      <p v-else class="text-xs text-muted rounded-md border border-default p-2">No brand kit selected.</p>
      <p v-if="kit" class="text-[11px] text-muted mt-2">{{ kit.name }} · generated for every active size</p>
    </div>
    <!-- Built-in Templates -->
    <h4 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted) mb-3">Built-in</h4>
    <div class="grid grid-cols-2 gap-2">
      <UButton
        v-for="tpl in TEMPLATES"
        :key="tpl.id"
        color="neutral"
        variant="outline"
        :ui="{ base: 'block h-auto rounded-lg overflow-hidden p-0 text-left hover:ring-2 hover:ring-(--ui-primary)/40' }"
        @click="applyTemplate(tpl.id)"
      >
        <div
          class="aspect-[4/3] flex items-center justify-center p-3 relative"
          :style="{ backgroundColor: previewStyles[tpl.id]?.bg || '#111' }"
        >
          <div class="text-center space-y-1.5">
            <div
              class="text-[11px] font-black uppercase tracking-wider leading-none"
              :style="{ color: previewStyles[tpl.id]?.textColor || '#fff' }"
            >
              HEADLINE
            </div>
            <div
              v-if="previewStyles[tpl.id]?.accent"
              class="w-8 h-0.5 mx-auto rounded"
              :style="{ backgroundColor: previewStyles[tpl.id]?.accent }"
            />
            <div
              class="text-[7px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-sm inline-block"
              :style="{
                backgroundColor: previewStyles[tpl.id]?.accent || previewStyles[tpl.id]?.textColor || '#fff',
                color: previewStyles[tpl.id]?.bg || '#000'
              }"
            >
              CTA
            </div>
          </div>
        </div>
        <div class="px-2 py-1.5 text-xs font-medium text-(--ui-text) text-center bg-(--ui-bg-elevated)">
          {{ tpl.name }}
        </div>
      </UButton>
    </div>

    <!-- Saved (DB) Templates -->
    <template v-if="dbTemplates.length">
      <h4 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted) mt-5 mb-3">Saved Templates</h4>
      <div class="space-y-1.5">
        <UButton
          v-for="tpl in dbTemplates"
          :key="tpl.id"
          color="neutral"
          variant="ghost"
          :ui="{ base: 'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left' }"
          @click="applyDbTemplate(tpl)"
        >
          <div class="min-w-0 flex-1">
            <div class="text-xs font-medium truncate">{{ tpl.name }}</div>
            <div class="flex items-center gap-1.5 mt-0.5">
              <UBadge color="neutral" variant="subtle" size="xs">{{ tpl.category }}</UBadge>
              <span class="text-[10px] text-(--ui-text-muted) flex items-center gap-0.5">
                <UIcon name="i-lucide-download" class="w-2.5 h-2.5" />
                {{ tpl.usageCount || 0 }}
              </span>
            </div>
          </div>
          <span class="rounded bg-elevated px-2 py-1 text-xs">Load</span>
        </UButton>
      </div>
    </template>

    <!-- Custom HTML Templates -->
    <div class="mt-5">
      <h4 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted) mb-3">Custom HTML</h4>
      <p class="text-xs text-(--ui-text-muted) mb-2">
        Import raw HTML+CSS+JS banners with GSAP animations
      </p>
      <UButton
        label="Browse Custom Templates"
        icon="i-lucide-code"
        variant="soft"
        size="xs"
        block
        @click="router.push('/agency/banner-studio/custom-templates')"
      />
    </div>

    <!-- View All Link -->
    <div class="mt-4 pt-3 border-t border-(--ui-border)">
      <UButton
        label="View All Templates"
        icon="i-lucide-layout-template"
        variant="ghost"
        size="xs"
        block
        @click="router.push('/agency/banner-studio/templates')"
      />
    </div>
  </div>
</template>
