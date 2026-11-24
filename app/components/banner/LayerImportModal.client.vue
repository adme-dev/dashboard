<script setup lang="ts">
import { LAYER_IMPORT_MAX_ELEMENTS, LAYER_IMPORT_TYPICAL_SECONDS, LAYER_IMPORT_USD_PER_PICTURE, layerImportMaxCostUsd } from '~~/shared/bannerLayerImport'
import { formatUsd } from '~/utils/banner-layer-import'
import { resolveBannerFormat } from '~/utils/banner-constants'

const emit = defineEmits<{ openBrand: [] }>()
const { state, activeLayers, selectLayer, setActiveArtboard } = useBannerStudio()
const { open, source, starting, status, startError, applyError, outcome, busy, view, elapsedMs, waitingToPlace, start, placeLayers, replaceLogo, reset } = useBannerLayerImport()
const { kit } = useBannerProjectBrand()
const toast = useToast()

const canvas = computed(() => resolveBannerFormat(outcome.value?.formatKey || state.activeKey))
const elapsed = computed(() => {
  const seconds = Math.floor(elapsedMs.value / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})
const result = computed(() => status.value?.result ?? null)
const finished = computed(() => view.value.phase === 'done' || view.value.phase === 'partial')
/** Redrawn logos from this import that still point at the model's version. */
const logosToReplace = computed(() => {
  if (!outcome.value || state.activeKey !== outcome.value.formatKey) return []
  return activeLayers.value.filter(layer => outcome.value!.logoLayerIds.includes(layer.id) && layer.importedFrom?.logoPlaceholder)
})
const brandLogos = computed(() => (kit.value?.logos ?? []).slice(0, 4))
const stepLabel: Record<string, string> = { vision: 'Not found', extract: 'Not cut out', base: 'Background', text: 'Live text' }

function useLogo(layerId: number, url: string, name: string) {
  if (replaceLogo(layerId, url)) toast.add({ title: 'Logo replaced', description: name, color: 'success' })
}
function showLayer(layerId: number) {
  if (outcome.value && state.activeKey !== outcome.value.formatKey) setActiveArtboard(outcome.value.formatKey)
  selectLayer(layerId)
  open.value = false
}
function openBrand() {
  open.value = false
  emit('openBrand')
}
function again() {
  reset()
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import image as layers"
    description="Split a flat picture into a background and separate, editable elements."
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex gap-4">
          <div class="size-24 shrink-0 overflow-hidden rounded-md border border-default bg-elevated">
            <img
              v-if="source && safeMediaUrl(source.url)"
              :src="safeMediaUrl(source.url)"
              :alt="source.name"
              class="size-full object-contain"
            >
          </div>
          <div class="min-w-0 space-y-1">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ source?.name }}
            </p>
            <p class="text-xs text-muted">
              Each element is placed where it sits in the picture, in the same stacking order, inside one group. Lettering is rebuilt as live text, with the original lettering kept hidden underneath for comparison.
            </p>
          </div>
        </div>

        <!-- Before it starts: what it costs and what to expect -->
        <template v-if="!status">
          <dl class="grid grid-cols-3 gap-3 rounded-md border border-default p-3 text-xs">
            <div>
              <dt class="text-muted">
                Cost
              </dt>
              <dd class="font-medium text-highlighted">
                Up to {{ formatUsd(layerImportMaxCostUsd()) }}
              </dd>
              <dd class="text-muted">
                About {{ formatUsd(LAYER_IMPORT_USD_PER_PICTURE) }} per element, {{ LAYER_IMPORT_MAX_ELEMENTS }} at most
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Time
              </dt>
              <dd class="font-medium text-highlighted">
                About {{ Math.round(LAYER_IMPORT_TYPICAL_SECONDS / 10) * 10 }} seconds
              </dd>
              <dd class="text-muted">
                You can keep working
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Added to
              </dt>
              <dd class="font-medium text-highlighted">
                {{ canvas ? `${canvas.w} × ${canvas.h}` : 'This canvas' }}
              </dd>
              <dd class="text-muted">
                The whole picture, centred
              </dd>
            </div>
          </dl>
          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            title="Every element is redrawn by AI"
            description="Check small print before delivery, and replace any logo with the real logo file. You are charged for the run even if you undo it."
          />
          <UAlert
            v-if="startError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="The import did not start"
            :description="startError"
          />
        </template>

        <!-- While it runs -->
        <div
          v-else-if="view.phase === 'waiting' || view.phase === 'working'"
          class="space-y-2"
          role="status"
          aria-live="polite"
        >
          <div class="flex items-baseline justify-between gap-3">
            <p class="text-sm font-medium text-highlighted">
              {{ view.title }}
            </p>
            <p class="text-xs tabular-nums text-muted">
              {{ elapsed }}
            </p>
          </div>
          <UProgress :model-value="view.progress ?? 0" :max="100" size="sm" />
          <p class="text-xs text-muted">
            {{ view.detail }} You can close this and keep working; the layers are added when it finishes.
          </p>
        </div>

        <!-- Failed -->
        <UAlert
          v-else-if="view.phase === 'failed'"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="view.title"
          :description="`${view.detail} Nothing was added to the canvas.`"
        />

        <!-- Done -->
        <template v-else-if="finished">
          <UAlert
            :color="view.phase === 'partial' ? 'warning' : 'success'"
            variant="subtle"
            :icon="view.phase === 'partial' ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
            :title="view.title"
            :description="view.detail"
          />
          <UAlert
            v-if="applyError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="The layers were not added"
            :description="applyError"
          />
          <dl v-if="outcome" class="grid grid-cols-3 gap-3 rounded-md border border-default p-3 text-xs">
            <div>
              <dt class="text-muted">
                Layers added
              </dt>
              <dd class="font-medium text-highlighted">
                {{ outcome.layerIds.length }}
              </dd>
              <dd class="text-muted">
                In one group
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Live text
              </dt>
              <dd class="font-medium text-highlighted">
                {{ outcome.textCount }}
              </dd>
              <dd class="text-muted">
                {{ outcome.textCount ? 'Original kept hidden' : 'No lettering found' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Cost
              </dt>
              <dd class="font-medium text-highlighted">
                {{ result?.costUsd != null ? formatUsd(result.costUsd) : 'Not reported' }}
              </dd>
              <dd class="text-muted">
                {{ result?.latencyMs != null ? `${Math.round(result.latencyMs / 1000)} seconds` : 'From published prices' }}
              </dd>
            </div>
          </dl>
          <p v-if="outcome" class="text-xs text-muted">
            One undo removes the whole import. Check the live text against the picture: the font is the closest available, not always the original.
          </p>

          <section v-if="result?.skipped.length" aria-label="Parts that did not come back" class="space-y-1.5">
            <h4 class="text-xs font-semibold text-highlighted">
              Did not come back
            </h4>
            <ul class="space-y-1">
              <li v-for="(skip, index) in result.skipped" :key="index" class="flex items-start gap-2 text-xs">
                <UBadge
                  color="warning"
                  variant="subtle"
                  size="sm"
                  class="shrink-0"
                >
                  {{ stepLabel[skip.step] || 'Skipped' }}
                </UBadge>
                <span class="text-muted"><span class="font-medium text-default">{{ skip.name }}</span>: {{ skip.reason }}</span>
              </li>
            </ul>
          </section>
          <p v-if="result && !result.base" class="text-xs text-muted">
            The background did not come back, so only the elements were added. Keep the original picture underneath them.
          </p>

          <section v-if="logosToReplace.length" aria-label="Logos to replace" class="space-y-2">
            <h4 class="text-xs font-semibold text-highlighted">
              Replace with the real logo file
            </h4>
            <div v-for="layer in logosToReplace" :key="layer.id" class="space-y-2 rounded-md border border-default p-3">
              <div class="flex items-center gap-3">
                <div class="h-10 w-16 shrink-0 overflow-hidden rounded border border-default bg-elevated">
                  <img
                    v-if="layer.src && safeMediaUrl(layer.src)"
                    :src="safeMediaUrl(layer.src)"
                    :alt="layer.name"
                    class="size-full object-contain"
                  >
                </div>
                <p class="min-w-0 text-xs text-muted">
                  <span class="font-medium text-default">{{ layer.name }}</span> was redrawn by AI and is not the real logo.
                </p>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="logo in brandLogos"
                  :key="logo.url"
                  :label="`Use ${logo.name}`"
                  icon="i-lucide-replace"
                  size="xs"
                  color="primary"
                  variant="soft"
                  @click="useLogo(layer.id, logo.url, logo.name)"
                />
                <UButton
                  :label="kit ? `Open ${kit.name} brand assets` : 'Open brand assets'"
                  icon="i-lucide-palette"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  @click="openBrand"
                />
                <UButton
                  label="Choose from Media"
                  icon="i-lucide-image-plus"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="showLayer(layer.id)"
                />
              </div>
              <p v-if="!brandLogos.length" class="text-xs text-muted">
                {{ kit ? 'This brand kit has no logo files yet.' : 'No brand kit is linked to this project.' }} Add the logo in Brand, or select the layer and use Replace image.
              </p>
            </div>
          </section>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <template v-if="!status">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="() => { open = false }"
          />
          <UButton
            label="Import as layers"
            icon="i-lucide-layers"
            :loading="starting"
            :disabled="!source"
            @click="start"
          />
        </template>
        <template v-else-if="busy">
          <UButton
            label="Keep working"
            color="neutral"
            variant="outline"
            @click="() => { open = false }"
          />
        </template>
        <template v-else>
          <UButton
            v-if="view.phase === 'failed'"
            label="Try again"
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="outline"
            @click="again"
          />
          <UButton
            v-if="waitingToPlace"
            label="Add to this canvas"
            icon="i-lucide-layers"
            @click="placeLayers"
          />
          <UButton
            label="Done"
            :color="waitingToPlace ? 'neutral' : 'primary'"
            :variant="waitingToPlace ? 'ghost' : 'solid'"
            @click="() => { open = false }"
          />
        </template>
      </div>
    </template>
  </UModal>
</template>
