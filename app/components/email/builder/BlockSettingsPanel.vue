<!-- app/components/email/builder/BlockSettingsPanel.vue -->
<!-- Per-block inspector for the email editor. Renders the editable settings for the
     selected block (style + props) and emits granular updates. Ported from
     layers/edm/.../BlockSettingsPanel.vue, re-skinned shadcn→Nuxt UI; the CMS media
     library + automotive deps are stripped (image is a plain URL input). -->
<script setup lang="ts">
import { getEdmSectionSettings } from '~~/app/utils/edmSectionSettings'

interface BlockData {
  style?: {
    padding?: { top: number, bottom: number, left: number, right: number }
    textAlign?: 'left' | 'center' | 'right'
    color?: string
    backgroundColor?: string | null
    borderColor?: string | null
    borderRadius?: number
    fontSize?: number
    fontFamily?: string
    fontWeight?: 'bold' | 'normal'
    [key: string]: unknown
  }
  props?: Record<string, unknown>
}

const props = defineProps<{
  block: { id: string, type: string, data: BlockData }
}>()

const emit = defineEmits<{ update: [updates: { style?: unknown, props?: unknown }] }>()

const FONT_OPTIONS = [
  { label: 'Modern Sans', value: 'MODERN_SANS' },
  { label: 'Book Sans', value: 'BOOK_SANS' },
  { label: 'Geometric Sans', value: 'GEOMETRIC_SANS' },
  { label: 'Modern Serif', value: 'MODERN_SERIF' },
  { label: 'Monospace', value: 'MONOSPACE' }
]

const HEADING_LEVELS = [
  { label: 'H1', value: 'h1' },
  { label: 'H2', value: 'h2' },
  { label: 'H3', value: 'h3' },
  { label: 'H4', value: 'h4' }
]

const BUTTON_SIZES = [
  { value: 'x-small', label: 'Xs' },
  { value: 'small', label: 'Sm' },
  { value: 'medium', label: 'Md' },
  { value: 'large', label: 'Lg' }
]

const BUTTON_STYLES = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'pill', label: 'Pill' }
]

const COLUMN_ALIGNMENTS = [
  { value: 'top', icon: 'i-lucide-align-vertical-justify-start' },
  { value: 'middle', icon: 'i-lucide-align-vertical-justify-center' },
  { value: 'bottom', icon: 'i-lucide-align-vertical-justify-end' }
]

const TEXT_ALIGNMENTS = ['left', 'center', 'right']

const sectionSettings = computed(() => getEdmSectionSettings(props.block.type))

function alignIcon(align: string): string {
  if (align === 'center') return 'i-lucide-align-center'
  if (align === 'right') return 'i-lucide-align-right'
  return 'i-lucide-align-left'
}

function updateProp(key: string, value: unknown) {
  emit('update', { props: { ...(props.block.data?.props || {}), [key]: value } })
}

function propArray<T>(key: string, fallback: T[]): T[] {
  return ((props.block.data?.props?.[key] as T[] | undefined) || fallback)
}

function updateMenuItem(index: number, key: 'label' | 'url', value: string) {
  const items = [...propArray<{ label: string, url: string }>('items', [{ label: '', url: '' }])]
  items[index] = { ...(items[index] || { label: '', url: '' }), [key]: value }
  updateProp('items', items)
}

function addMenuItem() {
  updateProp('items', [...propArray<{ label: string, url: string }>('items', []), { label: 'Link', url: '#' }])
}

function updateFeatureItem(index: number, key: 'icon' | 'heading' | 'description', value: string) {
  const features = [...propArray<{ icon?: string, heading: string, description: string }>('features', [])]
  features[index] = { ...(features[index] || { icon: '•', heading: '', description: '' }), [key]: value }
  updateProp('features', features)
}

function addFeatureItem() {
  updateProp('features', [...propArray<{ icon?: string, heading: string, description: string }>('features', []), { icon: '•', heading: 'Feature', description: 'Short description.' }])
}

function updateStyle(key: string, value: unknown) {
  emit('update', { style: { ...(props.block.data?.style || {}), [key]: value } })
}

function updatePadding(side: 'top' | 'bottom' | 'left' | 'right', value: number) {
  emit('update', {
    style: {
      ...(props.block.data?.style || {}),
      padding: {
        ...(props.block.data?.style?.padding || { top: 16, bottom: 16, left: 24, right: 24 }),
        [side]: value
      }
    }
  })
}

function getColumnWidth(index: number): number | null {
  const fixedWidths = props.block.data?.props?.fixedWidths as (number | null)[] | undefined
  return fixedWidths?.[index] ?? null
}

function updateColumnWidth(index: number, value: string | number) {
  const fixedWidths = [
    ...((props.block.data?.props?.fixedWidths as (number | null)[]) || [null, null, null])
  ]
  const numValue = typeof value === 'string' ? (value === '' ? null : parseInt(value, 10)) : value
  fixedWidths[index] = numValue
  emit('update', { props: { ...(props.block.data?.props || {}), fixedWidths } })
}
</script>

<template>
  <div class="space-y-4">
    <!-- Text / Heading -->
    <template v-if="block.type === 'Text' || block.type === 'Heading'">
      <UFormField label="Content">
        <UTextarea
          :model-value="(block.data?.props?.text as string) || ''"
          :rows="3"
          class="w-full"
          @update:model-value="updateProp('text', $event)"
        />
      </UFormField>

      <UFormField v-if="block.type === 'Heading'" label="Level">
        <USelect
          :model-value="(block.data?.props?.level as string) || 'h2'"
          :items="HEADING_LEVELS"
          value-key="value"
          class="w-full"
          @update:model-value="updateProp('level', $event)"
        />
      </UFormField>

      <UFormField label="Text color">
        <div class="flex gap-2">
          <UInput
            type="color"
            :model-value="block.data?.style?.color || '#000000'"
            class="w-12"
            @update:model-value="updateStyle('color', $event)"
          />
          <UInput
            :model-value="block.data?.style?.color || '#000000'"
            class="flex-1"
            @update:model-value="updateStyle('color', $event)"
          />
        </div>
      </UFormField>

      <UFormField label="Background color">
        <div class="flex gap-2 items-center">
          <UInput
            type="color"
            :model-value="block.data?.style?.backgroundColor || '#ffffff'"
            class="w-12"
            @update:model-value="updateStyle('backgroundColor', $event)"
          />
          <UInput
            :model-value="block.data?.style?.backgroundColor || '#ffffff'"
            class="flex-1"
            @update:model-value="updateStyle('backgroundColor', $event)"
          />
          <UButton
            v-if="block.data?.style?.backgroundColor && block.data.style.backgroundColor !== '#ffffff'"
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            title="Clear background"
            @click="updateStyle('backgroundColor', null)"
          />
        </div>
      </UFormField>

      <UFormField label="Font family">
        <USelect
          :model-value="block.data?.style?.fontFamily || 'MODERN_SANS'"
          :items="FONT_OPTIONS"
          value-key="value"
          class="w-full"
          @update:model-value="updateStyle('fontFamily', $event)"
        />
      </UFormField>

      <UFormField :label="`Font size — ${block.data?.style?.fontSize || 16}px`">
        <USlider
          :model-value="block.data?.style?.fontSize || 16"
          :min="10"
          :max="48"
          :step="1"
          @update:model-value="updateStyle('fontSize', $event)"
        />
      </UFormField>

      <UFormField label="Font weight">
        <div class="grid grid-cols-2 gap-2">
          <UButton
            block
            :variant="block.data?.style?.fontWeight !== 'bold' ? 'solid' : 'outline'"
            :color="block.data?.style?.fontWeight !== 'bold' ? 'primary' : 'neutral'"
            label="Regular"
            @click="updateStyle('fontWeight', 'normal')"
          />
          <UButton
            block
            class="font-bold"
            :variant="block.data?.style?.fontWeight === 'bold' ? 'solid' : 'outline'"
            :color="block.data?.style?.fontWeight === 'bold' ? 'primary' : 'neutral'"
            label="Bold"
            @click="updateStyle('fontWeight', 'bold')"
          />
        </div>
      </UFormField>

      <UFormField label="Alignment">
        <div class="grid grid-cols-3 gap-2">
          <UButton
            v-for="align in TEXT_ALIGNMENTS"
            :key="align"
            block
            :icon="alignIcon(align)"
            :variant="(block.data?.style?.textAlign || 'left') === align ? 'solid' : 'outline'"
            :color="(block.data?.style?.textAlign || 'left') === align ? 'primary' : 'neutral'"
            @click="updateStyle('textAlign', align)"
          />
        </div>
      </UFormField>
    </template>

    <!-- Button -->
    <template v-else-if="block.type === 'Button'">
      <UFormField label="Text">
        <UInput
          :model-value="(block.data?.props?.text as string) || ''"
          class="w-full"
          @update:model-value="updateProp('text', $event)"
        />
      </UFormField>

      <UFormField label="Url">
        <UInput
          :model-value="(block.data?.props?.url as string) || ''"
          placeholder="https://"
          class="w-full"
          @update:model-value="updateProp('url', $event)"
        />
      </UFormField>

      <UFormField label="Width">
        <div class="grid grid-cols-2 gap-2">
          <UButton
            block
            label="Full"
            :variant="block.data?.props?.fullWidth === true ? 'solid' : 'outline'"
            :color="block.data?.props?.fullWidth === true ? 'primary' : 'neutral'"
            @click="updateProp('fullWidth', true)"
          />
          <UButton
            block
            label="Auto"
            :variant="block.data?.props?.fullWidth !== true ? 'solid' : 'outline'"
            :color="block.data?.props?.fullWidth !== true ? 'primary' : 'neutral'"
            @click="updateProp('fullWidth', false)"
          />
        </div>
      </UFormField>

      <UFormField label="Size">
        <div class="grid grid-cols-4 gap-2">
          <UButton
            v-for="size in BUTTON_SIZES"
            :key="size.value"
            block
            :label="size.label"
            :variant="(block.data?.props?.size || 'medium') === size.value ? 'solid' : 'outline'"
            :color="(block.data?.props?.size || 'medium') === size.value ? 'primary' : 'neutral'"
            @click="updateProp('size', size.value)"
          />
        </div>
      </UFormField>

      <UFormField label="Style">
        <div class="grid grid-cols-3 gap-2">
          <UButton
            v-for="style in BUTTON_STYLES"
            :key="style.value"
            block
            :label="style.label"
            :variant="(block.data?.props?.buttonStyle || 'rounded') === style.value ? 'solid' : 'outline'"
            :color="(block.data?.props?.buttonStyle || 'rounded') === style.value ? 'primary' : 'neutral'"
            @click="updateProp('buttonStyle', style.value)"
          />
        </div>
      </UFormField>

      <UFormField label="Text color">
        <div class="flex gap-2">
          <UInput
            type="color"
            :model-value="(block.data?.props?.buttonTextColor as string) || '#FFFFFF'"
            class="w-12"
            @update:model-value="updateProp('buttonTextColor', $event)"
          />
          <UInput
            :model-value="(block.data?.props?.buttonTextColor as string) || '#FFFFFF'"
            class="flex-1"
            @update:model-value="updateProp('buttonTextColor', $event)"
          />
        </div>
      </UFormField>

      <UFormField label="Button color">
        <div class="flex gap-2">
          <UInput
            type="color"
            :model-value="(block.data?.props?.buttonBackgroundColor as string) || '#2f4574'"
            class="w-12"
            @update:model-value="updateProp('buttonBackgroundColor', $event)"
          />
          <UInput
            :model-value="(block.data?.props?.buttonBackgroundColor as string) || '#2f4574'"
            class="flex-1"
            @update:model-value="updateProp('buttonBackgroundColor', $event)"
          />
        </div>
      </UFormField>

      <UFormField label="Font family">
        <USelect
          :model-value="block.data?.style?.fontFamily || 'MODERN_SANS'"
          :items="FONT_OPTIONS"
          value-key="value"
          class="w-full"
          @update:model-value="updateStyle('fontFamily', $event)"
        />
      </UFormField>

      <UFormField :label="`Font size — ${block.data?.style?.fontSize || 16}px`">
        <USlider
          :model-value="block.data?.style?.fontSize || 16"
          :min="10"
          :max="32"
          :step="1"
          @update:model-value="updateStyle('fontSize', $event)"
        />
      </UFormField>

      <UFormField label="Alignment">
        <div class="grid grid-cols-3 gap-2">
          <UButton
            v-for="align in TEXT_ALIGNMENTS"
            :key="align"
            block
            :icon="alignIcon(align)"
            :variant="(block.data?.style?.textAlign || 'left') === align ? 'solid' : 'outline'"
            :color="(block.data?.style?.textAlign || 'left') === align ? 'primary' : 'neutral'"
            @click="updateStyle('textAlign', align)"
          />
        </div>
      </UFormField>
    </template>

    <!-- Image / Avatar -->
    <template v-else-if="block.type === 'Image' || block.type === 'Avatar'">
      <div
        v-if="block.data?.props?.url"
        class="relative aspect-video rounded-lg overflow-hidden bg-elevated"
      >
        <img
          :src="block.data.props.url as string"
          :alt="(block.data.props.alt as string) || 'Preview'"
          class="w-full h-full object-cover"
        >
      </div>

      <UFormField label="Image URL">
        <UInput
          :model-value="(block.data?.props?.url as string) || ''"
          placeholder="https://"
          class="w-full"
          @update:model-value="updateProp('url', $event)"
        />
      </UFormField>

      <UFormField label="Alt text">
        <UInput
          :model-value="(block.data?.props?.alt as string) || ''"
          placeholder="Describe the image for accessibility"
          class="w-full"
          @update:model-value="updateProp('alt', $event)"
        />
      </UFormField>

      <UFormField label="Link URL (optional)">
        <UInput
          :model-value="(block.data?.props?.linkHref as string) || ''"
          placeholder="https://"
          class="w-full"
          @update:model-value="updateProp('linkHref', $event)"
        />
      </UFormField>

      <UFormField label="Alignment">
        <div class="grid grid-cols-3 gap-2">
          <UButton
            v-for="align in TEXT_ALIGNMENTS"
            :key="align"
            block
            :icon="alignIcon(align)"
            :variant="(block.data?.props?.contentAlignment || 'center') === align ? 'solid' : 'outline'"
            :color="(block.data?.props?.contentAlignment || 'center') === align ? 'primary' : 'neutral'"
            @click="updateProp('contentAlignment', align)"
          />
        </div>
      </UFormField>
    </template>

    <!-- Spacer -->
    <template v-else-if="block.type === 'Spacer'">
      <UFormField :label="`Height — ${block.data?.props?.height || 24}px`">
        <USlider
          :model-value="(block.data?.props?.height as number) || 24"
          :min="0"
          :max="200"
          :step="4"
          @update:model-value="updateProp('height', $event)"
        />
      </UFormField>
    </template>

    <!-- Divider -->
    <template v-else-if="block.type === 'Divider'">
      <UFormField label="Line color">
        <div class="flex gap-2">
          <UInput
            type="color"
            :model-value="(block.data?.props?.lineColor as string) || '#e5e7eb'"
            class="w-12"
            @update:model-value="updateProp('lineColor', $event)"
          />
          <UInput
            :model-value="(block.data?.props?.lineColor as string) || '#e5e7eb'"
            class="flex-1"
            @update:model-value="updateProp('lineColor', $event)"
          />
        </div>
      </UFormField>

      <UFormField :label="`Line height — ${block.data?.props?.lineHeight || 1}px`">
        <USlider
          :model-value="(block.data?.props?.lineHeight as number) || 1"
          :min="1"
          :max="10"
          :step="1"
          @update:model-value="updateProp('lineHeight', $event)"
        />
      </UFormField>
    </template>

    <!-- Html -->
    <template v-else-if="block.type === 'Html'">
      <UFormField label="HTML content">
        <UTextarea
          :model-value="(block.data?.props?.contents as string) || ''"
          :rows="6"
          class="w-full font-mono text-xs"
          @update:model-value="updateProp('contents', $event)"
        />
      </UFormField>
    </template>

    <!-- Container -->
    <template v-else-if="block.type === 'Container'">
      <UFormField label="Background color">
        <div class="flex gap-2 items-center">
          <UInput
            type="color"
            :model-value="block.data?.style?.backgroundColor || '#ffffff'"
            class="w-12"
            @update:model-value="updateStyle('backgroundColor', $event)"
          />
          <UInput
            :model-value="block.data?.style?.backgroundColor || ''"
            placeholder="transparent"
            class="flex-1"
            @update:model-value="updateStyle('backgroundColor', $event)"
          />
          <UButton
            v-if="block.data?.style?.backgroundColor"
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            title="Clear background"
            @click="updateStyle('backgroundColor', null)"
          />
        </div>
      </UFormField>

      <UFormField label="Border color">
        <div class="flex gap-2 items-center">
          <UInput
            type="color"
            :model-value="block.data?.style?.borderColor || '#e5e7eb'"
            class="w-12"
            @update:model-value="updateStyle('borderColor', $event)"
          />
          <UInput
            :model-value="block.data?.style?.borderColor || ''"
            placeholder="none"
            class="flex-1"
            @update:model-value="updateStyle('borderColor', $event)"
          />
          <UButton
            v-if="block.data?.style?.borderColor"
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            title="Clear border"
            @click="updateStyle('borderColor', null)"
          />
        </div>
      </UFormField>

      <UFormField :label="`Border radius — ${block.data?.style?.borderRadius ?? 0}px`">
        <USlider
          :model-value="block.data?.style?.borderRadius ?? 0"
          :min="0"
          :max="24"
          :step="1"
          @update:model-value="updateStyle('borderRadius', $event)"
        />
      </UFormField>
    </template>

    <!-- ColumnsContainer -->
    <template v-else-if="block.type === 'ColumnsContainer'">
      <UFormField label="Number of columns">
        <div class="grid grid-cols-2 gap-2">
          <UButton
            block
            label="2"
            :variant="(block.data?.props?.columnsCount || 2) === 2 ? 'solid' : 'outline'"
            :color="(block.data?.props?.columnsCount || 2) === 2 ? 'primary' : 'neutral'"
            @click="updateProp('columnsCount', 2)"
          />
          <UButton
            block
            label="3"
            :variant="block.data?.props?.columnsCount === 3 ? 'solid' : 'outline'"
            :color="block.data?.props?.columnsCount === 3 ? 'primary' : 'neutral'"
            @click="updateProp('columnsCount', 3)"
          />
        </div>
      </UFormField>

      <UFormField label="Column widths">
        <div
          class="grid gap-2"
          :class="block.data?.props?.columnsCount === 3 ? 'grid-cols-3' : 'grid-cols-2'"
        >
          <div v-for="i in (block.data?.props?.columnsCount as number) || 2" :key="i">
            <UInput
              type="number"
              :model-value="getColumnWidth(i - 1) || ''"
              placeholder="auto"
              size="sm"
              class="w-full"
              @update:model-value="updateColumnWidth(i - 1, $event)"
            />
          </div>
        </div>
      </UFormField>

      <UFormField :label="`Columns gap — ${block.data?.props?.columnsGap ?? 16}px`">
        <USlider
          :model-value="(block.data?.props?.columnsGap as number) ?? 16"
          :min="0"
          :max="48"
          :step="4"
          @update:model-value="updateProp('columnsGap', $event)"
        />
      </UFormField>

      <UFormField label="Alignment">
        <div class="grid grid-cols-3 gap-2">
          <UButton
            v-for="align in COLUMN_ALIGNMENTS"
            :key="align.value"
            block
            :icon="align.icon"
            :variant="(block.data?.props?.contentAlignment || 'top') === align.value ? 'solid' : 'outline'"
            :color="(block.data?.props?.contentAlignment || 'top') === align.value ? 'primary' : 'neutral'"
            @click="updateProp('contentAlignment', align.value)"
          />
        </div>
      </UFormField>

      <UFormField label="Background color">
        <div class="flex gap-2 items-center">
          <UInput
            type="color"
            :model-value="block.data?.style?.backgroundColor || '#ffffff'"
            class="w-12"
            @update:model-value="updateStyle('backgroundColor', $event)"
          />
          <UInput
            :model-value="block.data?.style?.backgroundColor || ''"
            placeholder="transparent"
            class="flex-1"
            @update:model-value="updateStyle('backgroundColor', $event)"
          />
          <UButton
            v-if="block.data?.style?.backgroundColor"
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            title="Clear background"
            @click="updateStyle('backgroundColor', null)"
          />
        </div>
      </UFormField>
    </template>

    <template v-else-if="sectionSettings">
      <template v-for="field in sectionSettings.fields" :key="field.key">
        <UFormField v-if="field.type === 'text' || field.type === 'url'" :label="field.label">
          <UInput
            :model-value="(block.data?.props?.[field.key] as string) || ''"
            :placeholder="field.placeholder"
            class="w-full"
            @update:model-value="updateProp(field.key, $event)"
          />
        </UFormField>

        <UFormField v-else-if="field.type === 'textarea'" :label="field.label">
          <UTextarea
            :model-value="(block.data?.props?.[field.key] as string) || ''"
            :rows="3"
            class="w-full"
            @update:model-value="updateProp(field.key, $event)"
          />
        </UFormField>

        <UFormField v-else-if="field.type === 'color'" :label="field.label">
          <div class="flex gap-2">
            <UInput
              type="color"
              :model-value="(block.data?.props?.[field.key] as string) || '#ffffff'"
              class="w-12"
              @update:model-value="updateProp(field.key, $event)"
            />
            <UInput
              :model-value="(block.data?.props?.[field.key] as string) || ''"
              class="flex-1"
              @update:model-value="updateProp(field.key, $event)"
            />
          </div>
        </UFormField>

        <UFormField v-else-if="field.type === 'number'" :label="field.label">
          <UInput
            type="number"
            :model-value="(block.data?.props?.[field.key] as number) ?? ''"
            class="w-full"
            :min="field.min"
            :max="field.max"
            :step="field.step"
            @update:model-value="updateProp(field.key, Number($event))"
          />
        </UFormField>

        <UFormField v-else-if="field.type === 'boolean'" :label="field.label">
          <UCheckbox
            :model-value="block.data?.props?.[field.key] !== false"
            :label="field.label"
            @update:model-value="updateProp(field.key, $event)"
          />
        </UFormField>

        <UFormField v-else-if="field.type === 'menu-items'" :label="field.label">
          <div class="space-y-2">
            <div
              v-for="(item, index) in propArray<{ label: string, url: string }>('items', [])"
              :key="index"
              class="grid grid-cols-2 gap-2"
            >
              <UInput
                :model-value="item.label"
                placeholder="Label"
                @update:model-value="updateMenuItem(index, 'label', String($event))"
              />
              <UInput
                :model-value="item.url"
                placeholder="URL"
                @update:model-value="updateMenuItem(index, 'url', String($event))"
              />
            </div>
            <UButton
              icon="i-lucide-plus"
              variant="outline"
              color="neutral"
              size="xs"
              label="Add item"
              @click="addMenuItem()"
            />
          </div>
        </UFormField>

        <UFormField v-else-if="field.type === 'feature-items'" :label="field.label">
          <div class="space-y-3">
            <div
              v-for="(item, index) in propArray<{ icon?: string, heading: string, description: string }>('features', [])"
              :key="index"
              class="space-y-2 rounded border border-default p-2"
            >
              <UInput
                :model-value="item.icon || ''"
                placeholder="Icon"
                @update:model-value="updateFeatureItem(index, 'icon', String($event))"
              />
              <UInput
                :model-value="item.heading"
                placeholder="Heading"
                @update:model-value="updateFeatureItem(index, 'heading', String($event))"
              />
              <UTextarea
                :model-value="item.description"
                :rows="2"
                placeholder="Description"
                @update:model-value="updateFeatureItem(index, 'description', String($event))"
              />
            </div>
            <UButton
              icon="i-lucide-plus"
              variant="outline"
              color="neutral"
              size="xs"
              label="Add feature"
              @click="addFeatureItem()"
            />
          </div>
        </UFormField>
      </template>
    </template>

    <!-- Shared: padding (all block types) -->
    <div class="pt-4 border-t border-default">
      <p class="text-xs font-semibold uppercase text-muted mb-3">
        Padding
      </p>
      <div class="space-y-3">
        <div
          v-for="pad in [
            { side: 'top', icon: 'i-lucide-arrow-up-from-line', def: 16 },
            { side: 'bottom', icon: 'i-lucide-arrow-down-from-line', def: 16 },
            { side: 'left', icon: 'i-lucide-arrow-left-from-line', def: 24 },
            { side: 'right', icon: 'i-lucide-arrow-right-from-line', def: 24 }
          ]"
          :key="pad.side"
          class="flex items-center gap-3"
        >
          <UIcon :name="pad.icon" class="h-4 w-4 text-muted shrink-0" />
          <USlider
            class="flex-1"
            :model-value="block.data?.style?.padding?.[pad.side as 'top' | 'bottom' | 'left' | 'right'] ?? pad.def"
            :min="0"
            :max="64"
            :step="4"
            @update:model-value="updatePadding(pad.side as 'top' | 'bottom' | 'left' | 'right', $event)"
          />
          <span class="text-xs text-muted w-10 text-right">
            {{ block.data?.style?.padding?.[pad.side as 'top' | 'bottom' | 'left' | 'right'] ?? pad.def }}px
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
