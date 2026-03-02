<script setup lang="ts">
import { buildElementsLibrary, migrateLayer } from '~/utils/banner-constants'

const { activeLayers, activeFormat, addLayer, nextId } = useBannerStudio()
const toast = useToast()

const elements = computed(() => buildElementsLibrary(() => activeLayers.value))

const expandedCats = ref<string[]>(['Headlines', 'CTA Buttons', 'Badges & Labels', 'Shapes & Overlays'])

function toggleCat(cat: string) {
  const idx = expandedCats.value.indexOf(cat)
  if (idx >= 0) expandedCats.value.splice(idx, 1)
  else expandedCats.value.push(cat)
}

function addElement(item: typeof elements.value[number]['items'][number]) {
  if (!activeFormat.value) return
  const fmt = { w: activeFormat.value.w, h: activeFormat.value.h }
  const layerData = item.layer(fmt)
  addLayer(migrateLayer({ ...layerData, id: nextId() }))

  if (item.extra) {
    const extras = item.extra(fmt)
    extras.forEach(ex => {
      addLayer(migrateLayer({ ...ex, id: nextId() }))
    })
  }

  toast.add({ title: 'Element added', description: `"${item.name}" added`, color: 'success' })
}
</script>

<template>
  <div class="p-3 space-y-1">
    <div v-for="cat in elements" :key="cat.cat">
      <button
        class="w-full flex items-center gap-1.5 py-1.5 text-xs font-bold uppercase tracking-wider text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
        @click="toggleCat(cat.cat)"
      >
        <UIcon
          :name="expandedCats.includes(cat.cat) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="w-3.5 h-3.5"
        />
        {{ cat.cat }}
        <span class="text-[10px] font-normal ml-auto">{{ cat.items.length }}</span>
      </button>

      <div v-if="expandedCats.includes(cat.cat)" class="space-y-1 pb-2">
        <button
          v-for="item in cat.items"
          :key="item.name"
          class="w-full group rounded-md border border-(--ui-border) p-2 hover:border-(--ui-primary)/40 hover:bg-(--ui-bg) transition-all text-left"
          @click="addElement(item)"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-(--ui-text)">{{ item.name }}</span>
            <span class="text-[10px] text-(--ui-text-muted) opacity-0 group-hover:opacity-100 transition-opacity">+ Add</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
