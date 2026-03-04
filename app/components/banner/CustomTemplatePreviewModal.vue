<script setup lang="ts">
import type { CustomTemplate } from '~/types/banner-studio'
import { buildCustomBannerPreviewHTML } from '~/utils/custom-banner-builder'

const props = defineProps<{
  open: boolean
  template: CustomTemplate
}>()

const emit = defineEmits<{
  'update:open': [val: boolean]
  use: []
}>()

const previewHtml = computed(() => {
  const variables = typeof props.template.variables === 'string'
    ? JSON.parse(props.template.variables)
    : (props.template.variables || [])

  const defaults: Record<string, string> = {}
  for (const v of variables) {
    defaults[v.name] = v.default || ''
  }

  return buildCustomBannerPreviewHTML({
    html: props.template.html || '',
    css: props.template.css || '',
    js: props.template.js || '',
    width: props.template.width,
    height: props.template.height,
    variableDefaults: defaults,
    externalScripts: props.template.externalScripts || [],
    externalStyles: props.template.externalStyles || [],
  })
})

const scale = computed(() => {
  const maxW = 560
  const maxH = 400
  const sx = maxW / props.template.width
  const sy = maxH / props.template.height
  return Math.min(sx, sy, 1)
})

const categoryLabels: Record<string, string> = {
  'event-entertainment': 'Event & Entertainment',
  'product-ecommerce': 'Product & E-commerce',
  'brand-corporate': 'Brand & Corporate',
  'social-lifestyle': 'Social & Lifestyle',
  'typography-kinetic': 'Typography & Kinetic',
  'abstract-artistic': 'Abstract & Artistic',
}
</script>

<template>
  <UModal :open="open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h2 class="text-lg font-semibold">{{ template.name }}</h2>
            <div class="flex items-center gap-2 mt-1">
              <UBadge :label="categoryLabels[template.category] || template.category" variant="subtle" size="xs" />
              <span class="text-xs text-muted">{{ template.width }}x{{ template.height }}</span>
            </div>
          </div>
          <UButton icon="i-lucide-x" variant="ghost" size="sm" @click="emit('update:open', false)" />
        </div>

        <p v-if="template.description" class="text-sm text-muted mb-4">{{ template.description }}</p>

        <!-- Preview -->
        <div class="flex items-center justify-center bg-elevated rounded-lg p-4 mb-4 overflow-hidden">
          <div :style="{ transform: `scale(${scale})`, transformOrigin: 'top center' }">
            <iframe
              :srcdoc="previewHtml"
              :width="template.width"
              :height="template.height"
              sandbox="allow-scripts"
              class="border border-default rounded"
              style="display: block;"
            />
          </div>
        </div>

        <!-- Tags -->
        <div v-if="template.tags?.length" class="flex flex-wrap gap-1 mb-4">
          <UBadge
            v-for="tag in template.tags"
            :key="tag"
            :label="tag"
            variant="subtle"
            color="neutral"
            size="xs"
          />
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2 pt-3 border-t border-default">
          <UButton label="Close" variant="outline" @click="emit('update:open', false)" />
          <UButton
            label="Use This Template"
            icon="i-lucide-copy"
            color="primary"
            @click="emit('use')"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
