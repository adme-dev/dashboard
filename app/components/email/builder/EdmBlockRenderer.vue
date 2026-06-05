<!-- app/components/email/builder/EdmBlockRenderer.vue -->
<!-- Stateless leaf renderer: block type/style/props → editor-preview markup.
     Ported from layers/edm/.../EdmBlockRenderer.vue (shadcn class re-skinned). -->
<template>
  <div
    :class="['edm-render-shell', { 'edm-hidden-on-device': hiddenOnDevice }]"
    :data-hidden-on-device="hiddenOnDevice ? 'true' : undefined"
  >
    <!-- Heading -->
    <component
      :is="headingTag"
      v-if="type === 'Heading'"
      :style="headingStyle"
      :class="{ 'edm-editable': editable }"
      :contenteditable="editable ? 'plaintext-only' : undefined"
      @blur="editable && onTextEdit($event, false)"
      @keydown="onEditableKeydown"
    >
      {{ blockProps.text || (editable ? '' : 'New Heading') }}
    </component>

    <!-- Text -->
    <div
      v-else-if="type === 'Text'"
      class="edm-rich-text-wrap"
    >
      <div
        v-if="editable"
        class="edm-inline-toolbar"
        role="toolbar"
        aria-label="Text formatting"
      >
        <select
          class="edm-inline-toolbar-select edm-inline-toolbar-font"
          :value="currentTextFontFamily"
          aria-label="Font family"
          title="Font family"
          @change.stop="onToolbarSelect('fontFamily', $event)"
        >
          <option
            v-for="font in inlineFontOptions"
            :key="font.value"
            :value="font.value"
          >
            {{ font.label }}
          </option>
        </select>
        <span class="edm-inline-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          class="edm-inline-toolbar-button edm-inline-toolbar-text-button"
          aria-label="Decrease font size"
          title="Decrease font size"
          @click.stop="adjustTextFontSize(-1)"
        >
          A-
        </button>
        <span class="edm-inline-toolbar-size" aria-label="Current font size">{{ currentTextFontSize }}px</span>
        <button
          type="button"
          class="edm-inline-toolbar-button edm-inline-toolbar-text-button"
          aria-label="Increase font size"
          title="Increase font size"
          @click.stop="adjustTextFontSize(1)"
        >
          A+
        </button>
        <span class="edm-inline-toolbar-divider" aria-hidden="true" />
        <select
          class="edm-inline-toolbar-select"
          :value="currentTextFontWeight"
          aria-label="Font weight"
          title="Font weight"
          @change.stop="onToolbarSelect('fontWeight', $event)"
        >
          <option value="normal">
            Regular
          </option>
          <option value="bold">
            Bold
          </option>
        </select>
        <span class="edm-inline-toolbar-divider" aria-hidden="true" />
        <button
          v-for="align in inlineAlignments"
          :key="align.value"
          type="button"
          class="edm-inline-toolbar-button"
          :class="{ 'is-active': currentTextAlign === align.value }"
          :aria-label="align.label"
          :title="align.label"
          @click.stop="updateTextStyle({ textAlign: align.value })"
        >
          <UIcon :name="align.icon" class="edm-inline-toolbar-icon" aria-hidden="true" />
        </button>
        <span class="edm-inline-toolbar-divider" aria-hidden="true" />
        <button
          v-for="action in inlineFormatActions"
          :key="action.command"
          type="button"
          class="edm-inline-toolbar-button"
          :aria-label="action.label"
          :title="action.label"
          @mousedown.prevent
          @click.stop="applyInlineFormat(action.command)"
        >
          <UIcon :name="action.icon" class="edm-inline-toolbar-icon" aria-hidden="true" />
        </button>
        <span class="edm-inline-toolbar-divider" aria-hidden="true" />
        <div class="edm-inline-toolbar-color">
          <button
            type="button"
            class="edm-inline-toolbar-button"
            aria-label="Text color"
            title="Text color"
            @click.stop="showTextColorInput = !showTextColorInput"
          >
            <span
              class="edm-inline-toolbar-swatch"
              :style="{ backgroundColor: currentTextColor }"
              aria-hidden="true"
            />
          </button>
          <div v-if="showTextColorInput" class="edm-inline-toolbar-color-popover">
            <input
              type="color"
              class="edm-inline-toolbar-color-input"
              :value="currentTextColor"
              aria-label="Text color picker"
              @input.stop="onToolbarColor"
            >
            <input
              type="text"
              class="edm-inline-toolbar-color-value"
              :value="currentTextColor"
              aria-label="Text color value"
              @change.stop="onToolbarColor"
            >
          </div>
        </div>
      </div>
      <div
        ref="textEditorEl"
        :style="textStyle"
        :class="['revert-browser-styles', { 'edm-editable': editable }]"
        :contenteditable="editable ? 'true' : undefined"
        @blur="editable && onTextEdit($event, true)"
        v-html="blockProps.text || ''"
      />
    </div>

    <!-- Button -->
    <div v-else-if="type === 'Button'" :style="buttonWrapperStyle">
      <a
        :href="(blockProps.url as string) || '#'"
        :style="buttonLinkStyle"
        :class="{ 'edm-editable': editable }"
        :contenteditable="editable ? 'plaintext-only' : undefined"
        :target="editable ? undefined : '_blank'"
        @click="editable && $event.preventDefault()"
        @blur="editable && onTextEdit($event, false)"
        @keydown="onEditableKeydown"
      >
        {{ blockProps.text || (editable ? '' : 'Click Here') }}
      </a>
    </div>

    <!-- Image -->
    <div v-else-if="type === 'Image'" :style="imageWrapperStyle">
      <a
        v-if="blockProps.linkHref"
        :href="blockProps.linkHref as string"
        target="_blank"
        style="text-decoration: none"
      >
        <img :src="(blockProps.url as string) || ''" :alt="(blockProps.alt as string) || ''" :style="imageStyle">
      </a>
      <img
        v-else
        :src="(blockProps.url as string) || ''"
        :alt="(blockProps.alt as string) || ''"
        :style="imageStyle"
      >
    </div>

    <!-- Avatar -->
    <div v-else-if="type === 'Avatar'" :style="avatarWrapperStyle">
      <img :src="(blockProps.imageUrl as string) || ''" :alt="(blockProps.alt as string) || 'Avatar'" :style="avatarStyle">
    </div>

    <!-- Divider -->
    <div v-else-if="type === 'Divider'" :style="dividerWrapperStyle">
      <hr :style="dividerLineStyle">
    </div>

    <!-- Spacer -->
    <div v-else-if="type === 'Spacer'" :style="{ height: ((blockProps.height as number) || 24) + 'px' }" />

    <!-- Html -->
    <div
      v-else-if="type === 'Html'"
      ref="htmlEditableWrapEl"
      :style="baseStyle"
      class="edm-html-block-wrap revert-browser-styles"
      @click="onHtmlEditableClick"
      @contextmenu="onHtmlEditableContextMenu"
      @blur.capture="onHtmlEditableBlur"
    >
      <div
        v-if="selectedHtmlEditable"
        data-edm-html-region-toolbar
        :data-edm-html-text-toolbar="isHtmlTextSelection ? 'true' : undefined"
        :class="['edm-html-region-toolbar', { 'edm-html-text-toolbar': isHtmlTextSelection }]"
        :style="htmlRegionToolbarStyle"
        role="toolbar"
        :aria-label="`Imported ${selectedHtmlEditable.kind} quick actions`"
        @click.stop
        @mousedown.stop
      >
        <button
          type="button"
          data-edm-html-action="duplicate"
          class="edm-html-region-toolbar-button"
          aria-label="Duplicate item"
          title="Duplicate item"
          @click.stop="duplicateHtmlRegion(selectedHtmlEditable)"
        >
          <UIcon name="i-lucide-copy-plus" class="edm-html-region-toolbar-icon" aria-hidden="true" />
        </button>
        <span
          v-if="isHtmlTextSelection"
          class="edm-inline-toolbar-divider"
          aria-hidden="true"
        />
        <template v-if="isHtmlTextSelection">
          <select
            class="edm-inline-toolbar-select edm-inline-toolbar-font"
            :value="currentHtmlTextFontFamily"
            aria-label="Font family"
            title="Font family"
            @change.stop="onHtmlTextToolbarSelect('fontFamily', $event)"
          >
            <option
              v-for="font in htmlInlineFontOptionsForSelection"
              :key="font.value"
              :value="font.value"
            >
              {{ font.label }}
            </option>
          </select>
          <span class="edm-inline-toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            class="edm-inline-toolbar-button edm-inline-toolbar-text-button"
            aria-label="Decrease font size"
            title="Decrease font size"
            @click.stop="adjustHtmlTextFontSize(-1)"
          >
            A-
          </button>
          <span class="edm-inline-toolbar-size" aria-label="Current font size">{{ currentHtmlTextFontSize }}px</span>
          <button
            type="button"
            class="edm-inline-toolbar-button edm-inline-toolbar-text-button"
            aria-label="Increase font size"
            title="Increase font size"
            @click.stop="adjustHtmlTextFontSize(1)"
          >
            A+
          </button>
          <span class="edm-inline-toolbar-divider" aria-hidden="true" />
          <select
            class="edm-inline-toolbar-select"
            :value="currentHtmlTextFontWeight"
            aria-label="Font weight"
            title="Font weight"
            @change.stop="onHtmlTextToolbarSelect('fontWeight', $event)"
          >
            <option value="normal">
              Regular
            </option>
            <option value="bold">
              Bold
            </option>
          </select>
          <span class="edm-inline-toolbar-divider" aria-hidden="true" />
          <button
            v-for="align in inlineAlignments"
            :key="`html-${align.value}`"
            type="button"
            class="edm-inline-toolbar-button"
            :class="{ 'is-active': currentHtmlTextAlign === align.value }"
            :aria-label="align.label"
            :title="align.label"
            @click.stop="updateHtmlTextStyle({ textAlign: align.value })"
          >
            <UIcon :name="align.icon" class="edm-inline-toolbar-icon" aria-hidden="true" />
          </button>
          <span class="edm-inline-toolbar-divider" aria-hidden="true" />
          <div class="edm-inline-toolbar-color">
            <button
              type="button"
              class="edm-inline-toolbar-button"
              aria-label="Text color"
              title="Text color"
              @click.stop="showTextColorInput = !showTextColorInput"
            >
              <span
                class="edm-inline-toolbar-swatch"
                :style="{ backgroundColor: currentHtmlTextColor }"
                aria-hidden="true"
              />
            </button>
            <div v-if="showTextColorInput" class="edm-inline-toolbar-color-popover">
              <input
                type="color"
                class="edm-inline-toolbar-color-input"
                :value="currentHtmlTextColor"
                aria-label="Text color picker"
                @input.stop="onHtmlTextToolbarColor"
              >
              <input
                type="text"
                class="edm-inline-toolbar-color-value"
                :value="currentHtmlTextColor"
                aria-label="Text color value"
                @change.stop="onHtmlTextToolbarColor"
              >
            </div>
          </div>
        </template>
        <button
          v-if="selectedHtmlEditable.kind === 'image'"
          type="button"
          data-edm-html-action="change-image"
          class="edm-html-region-toolbar-button"
          aria-label="Change image"
          title="Change image"
          @click.stop="changeHtmlImage(selectedHtmlEditable)"
        >
          <UIcon name="i-lucide-image-up" class="edm-html-region-toolbar-icon" aria-hidden="true" />
        </button>
        <button
          v-if="selectedHtmlEditable.kind === 'image'"
          type="button"
          data-edm-html-action="edit-image-link"
          class="edm-html-region-toolbar-button"
          aria-label="Edit image link"
          title="Edit image link"
          @click.stop="editHtmlImageLink(selectedHtmlEditable)"
        >
          <UIcon name="i-lucide-link" class="edm-html-region-toolbar-icon" aria-hidden="true" />
        </button>
        <button
          v-if="selectedHtmlEditable.kind === 'link'"
          type="button"
          data-edm-html-action="edit-link"
          class="edm-html-region-toolbar-button"
          aria-label="Edit link URL"
          title="Edit link URL"
          @click.stop="editHtmlLink(selectedHtmlEditable)"
        >
          <UIcon name="i-lucide-link" class="edm-html-region-toolbar-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-edm-html-action="delete"
          class="edm-html-region-toolbar-button edm-html-region-toolbar-button-danger"
          aria-label="Delete item"
          title="Delete item"
          @click.stop="deleteHtmlRegion(selectedHtmlEditable)"
        >
          <UIcon name="i-lucide-trash-2" class="edm-html-region-toolbar-icon" aria-hidden="true" />
        </button>
      </div>
      <div v-html="htmlContents" />
    </div>

    <!-- Header -->
    <div v-else-if="type === 'header'" :style="headerStyle" class="edm-preview-section">
      <img
        v-if="headerLogoUrl"
        :src="headerLogoUrl"
        alt="Logo"
        :style="headerLogoStyle"
      >
      <div v-if="headerTagline" :style="headerTaglineStyle">
        {{ headerTagline }}
      </div>
    </div>

    <!-- Menu -->
    <div v-else-if="type === 'menu'" :style="menuStyle" class="edm-preview-section">
      <span
        v-for="(item, index) in menuItems"
        :key="`${item.label}-${index}`"
        :style="menuItemStyle"
      >
        <a :href="item.url" :style="menuLinkStyle" target="_blank">
          {{ item.label }}
        </a>
        <span v-if="index < menuItems.length - 1" :style="menuSeparatorStyle">{{ menuSeparator }}</span>
      </span>
    </div>

    <!-- Hero section -->
    <div v-else-if="type === 'hero-section'" :style="heroStyle" class="edm-preview-section">
      <div :style="heroHeadingStyle">
        {{ heroHeading }}
      </div>
      <div v-if="heroSubheading" :style="heroSubheadingStyle">
        {{ heroSubheading }}
      </div>
      <span v-if="heroHasCta" :style="heroCtaStyle">
        {{ heroCtaText }}
      </span>
    </div>

    <!-- Feature grid -->
    <div v-else-if="type === 'feature-grid'" :style="featureGridStyle" class="edm-preview-section">
      <div
        v-for="(feature, index) in featureItems"
        :key="`${feature.heading}-${index}`"
        :style="featureCardStyle"
      >
        <div :style="featureIconStyle">
          {{ feature.icon || '•' }}
        </div>
        <div
          :style="featureHeadingStyle"
          :class="{ 'edm-editable': editable }"
          :contenteditable="editable ? 'plaintext-only' : undefined"
          :data-edm-editable-element="editable ? 'feature-heading' : undefined"
          @blur="editable && onFeatureEdit(index, 'heading', $event)"
          @keydown="onEditableKeydown"
        >
          {{ feature.heading }}
        </div>
        <div
          :style="featureDescriptionStyle"
          :class="{ 'edm-editable': editable }"
          :contenteditable="editable ? 'plaintext-only' : undefined"
          :data-edm-editable-element="editable ? 'feature-description' : undefined"
          @blur="editable && onFeatureEdit(index, 'description', $event)"
          @keydown="onEditableKeydown"
        >
          {{ feature.description }}
        </div>
      </div>
    </div>

    <!-- CTA banner -->
    <div v-else-if="type === 'cta-banner'" :style="ctaBannerStyle" class="edm-preview-section">
      <div :style="ctaHeadingStyle">
        {{ ctaHeading }}
      </div>
      <div v-if="ctaSubheading" :style="ctaSubheadingStyle">
        {{ ctaSubheading }}
      </div>
      <span :style="ctaTextStyle">
        {{ ctaText }}
      </span>
    </div>

    <!-- Footer -->
    <div v-else-if="type === 'footer'" :style="footerStyle" class="edm-preview-section">
      <div v-if="footerAdditionalText" :style="footerAdditionalTextStyle">
        {{ footerAdditionalText }}
      </div>
      <div v-if="footerShowUnsubscribe" :style="footerUnsubscribeStyle">
        Unsubscribe
      </div>
    </div>

    <!-- Next steps -->
    <div v-else-if="type === 'next-steps'" :style="nextStepsStyle" class="edm-preview-section">
      <div :style="nextStepsHeadingStyle">
        Next Steps
      </div>
      <div
        v-for="(step, index) in nextStepsItems"
        :key="`${step.title}-${index}`"
        :style="nextStepsItemStyle"
      >
        <div :style="nextStepsNumberStyle">
          {{ index + 1 }}
        </div>
        <div>
          <div :style="nextStepsTitleStyle">
            {{ step.title }}
          </div>
          <div v-if="step.description" :style="nextStepsDescriptionStyle">
            {{ step.description }}
          </div>
        </div>
      </div>
    </div>

    <!-- Container (representative empty box for thumbnail; canvas uses ContainerBlockRenderer) -->
    <div v-else-if="type === 'Container'" :style="containerStyle" class="edm-preview-section" />

    <!-- Columns container (representative columns for thumbnail; canvas uses ColumnsContainerRenderer) -->
    <div v-else-if="type === 'ColumnsContainer'" :style="columnsContainerStyle" class="edm-preview-section">
      <div
        v-for="col in columnsContainerCount"
        :key="col"
        :style="columnsContainerCellStyle"
      />
    </div>

    <!-- Unknown -->
    <div
      v-else
      :style="baseStyle"
      class="text-muted text-sm p-4 text-center border border-dashed rounded"
    >
      Unknown block: {{ type }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { dividerLineThickness } from '~~/app/utils/edmDivider'
import { extendedStyleVue } from '~~/app/utils/edmStyle'
import { sanitizeInlineHtml, extractPlainText, safeInlineHref } from '~~/app/utils/edmInlineText'
import {
  annotateHtmlEditables,
  deleteHtmlEditable,
  duplicateHtmlEditable,
  getHtmlEditableSelection,
  updateHtmlEditable,
  type EdmHtmlEditableUpdate,
  type EdmHtmlEditableSelection
} from '~~/app/utils/edmHtmlEditables'

const props = defineProps<{
  type: string
  style?: Record<string, unknown> | null
  props?: Record<string, unknown> | null
  /** Phase 3b: when true, text blocks are contenteditable on the canvas. */
  editable?: boolean
  htmlEditingEnabled?: boolean
  imageLibraryEnabled?: boolean
  hiddenOnDevice?: boolean
  selectedHtmlEditableId?: string | null
}>()

const emit = defineEmits<{
  'update:text': [value: string]
  'update:props': [value: Record<string, unknown>]
  'update:style': [value: Record<string, unknown>]
  'select:html-editable': [value: EdmHtmlEditableSelection | null]
  'request:html-image-library': [value: EdmHtmlEditableSelection]
}>()

const textEditorEl = ref<HTMLElement | null>(null)
const htmlEditableWrapEl = ref<HTMLElement | null>(null)
const htmlRegionToolbarPosition = ref<{ left: number, top: number } | null>(null)
const showTextColorInput = ref(false)
const inlineFontOptions = [
  { label: 'Modern Sans', value: 'MODERN_SANS' },
  { label: 'Book Sans', value: 'BOOK_SANS' },
  { label: 'Geometric Sans', value: 'GEOMETRIC_SANS' },
  { label: 'Modern Serif', value: 'MODERN_SERIF' },
  { label: 'Monospace', value: 'MONOSPACE' }
] as const
const htmlInlineFontOptions = [
  { label: 'Inter', value: '\'Inter\', Arial, Helvetica, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times', value: '\'Times New Roman\', Times, serif' },
  { label: 'Mono', value: '\'SFMono-Regular\', Consolas, monospace' }
] as const
const inlineFormatActions = [
  { command: 'bold', label: 'Bold', icon: 'i-lucide-bold' },
  { command: 'italic', label: 'Italic', icon: 'i-lucide-italic' },
  { command: 'underline', label: 'Underline', icon: 'i-lucide-underline' },
  { command: 'createLink', label: 'Link', icon: 'i-lucide-link' }
] as const
const inlineAlignments = [
  { value: 'left', label: 'Align left', icon: 'i-lucide-align-left' },
  { value: 'center', label: 'Align center', icon: 'i-lucide-align-center' },
  { value: 'right', label: 'Align right', icon: 'i-lucide-align-right' }
] as const
type InlineFormatCommand = typeof inlineFormatActions[number]['command']

// Capture edited text on blur (not input) so the reactive value only changes
// once the field loses focus — avoids the contenteditable cursor-jump that a
// per-keystroke re-render would cause. Text is HTML-sanitised; Heading/Button
// are captured as plain text (they render escaped).
function onTextEdit(e: Event, asHtml: boolean) {
  const el = e.target as HTMLElement | null
  if (!el) return
  const value = asHtml
    ? sanitizeInlineHtml(el.innerHTML)
    : extractPlainText(el.textContent || '')
  const current = (props.props?.text as string) ?? ''
  // No-op edit → skip (avoids a needless v-html re-render/flash on blur).
  if (value === current) return
  // Don't persist an empty plain-text Heading/Button over its content — the user
  // sees a placeholder in preview otherwise. Empty Text (HTML) is allowed.
  if (!asHtml && value === '') return
  emit('update:text', value)
}

function onFeatureEdit(index: number, key: 'heading' | 'description', e: Event) {
  const el = e.target as HTMLElement | null
  if (!el) return
  const value = extractPlainText(el.textContent || '')
  if (value === '') return

  const rawFeatures = Array.isArray(blockProps.value.features)
    ? [...(blockProps.value.features as Record<string, unknown>[])]
    : featureItems.value.map(feature => ({ ...feature }))
  const current = { ...(rawFeatures[index] || {}) }
  if ((current[key] as string | undefined) === value) return

  rawFeatures[index] = { ...current, [key]: value }
  emit('update:props', { features: rawFeatures })
}

function commitTextEditorHtml(el: HTMLElement) {
  const value = sanitizeInlineHtml(el.innerHTML)
  el.innerHTML = value
  const current = (props.props?.text as string) ?? ''
  if (value !== current) emit('update:text', value)
}

function applyInlineFormat(command: InlineFormatCommand) {
  if (!props.editable || props.type !== 'Text') return
  const el = textEditorEl.value
  if (!el || typeof document === 'undefined') return
  if (typeof document.execCommand !== 'function') return

  el.focus()
  if (command === 'createLink') {
    const href = safeInlineHref(window.prompt('Link URL') || '')
    if (!href) return
    document.execCommand('createLink', false, href)
  } else {
    document.execCommand(command)
  }
  commitTextEditorHtml(el)
}

const currentTextFontFamily = computed(() => (props.style?.fontFamily as string) || 'MODERN_SANS')
const currentTextFontSize = computed(() => {
  const value = Number(props.style?.fontSize ?? 16)
  return Number.isFinite(value) ? Math.max(10, Math.min(48, Math.round(value))) : 16
})
const currentTextFontWeight = computed(() => {
  const value = props.style?.fontWeight
  return value === 'bold' ? 'bold' : 'normal'
})
const currentTextAlign = computed(() => (props.style?.textAlign as string) || 'left')
const currentTextColor = computed(() => (props.style?.color as string) || '#000000')

function updateTextStyle(stylePatch: Record<string, unknown>) {
  if (!props.editable || props.type !== 'Text') return
  emit('update:style', stylePatch)
}

function adjustTextFontSize(delta: 1 | -1) {
  updateTextStyle({ fontSize: Math.max(10, Math.min(48, currentTextFontSize.value + delta)) })
}

function onToolbarSelect(key: 'fontFamily' | 'fontWeight', e: Event) {
  const el = e.target as HTMLSelectElement | null
  if (!el) return
  updateTextStyle({ [key]: el.value })
}

function onToolbarColor(e: Event) {
  const el = e.target as HTMLInputElement | null
  if (!el) return
  updateTextStyle({ color: el.value || '#000000' })
}

// Enter commits the edit (blur) for single-line Heading/Button rather than
// inserting a newline.
function onEditableKeydown(e: KeyboardEvent) {
  if (!props.editable) return
  if (e.key === 'Enter') {
    e.preventDefault()
    ;(e.target as HTMLElement)?.blur()
  }
}

const blockProps = computed(() => (props.props || {}) as Record<string, unknown>)
const rawHtmlContents = computed(() => (blockProps.value.contents as string) || '')
const htmlAnnotationEnabled = computed(() => {
  return props.editable
    && props.type === 'Html'
    && (props.htmlEditingEnabled || Boolean(props.selectedHtmlEditableId))
})
const htmlContents = computed(() => {
  if (!htmlAnnotationEnabled.value) return rawHtmlContents.value
  return annotateHtmlEditables(rawHtmlContents.value, {
    editable: true,
    selectedId: props.selectedHtmlEditableId || null
  })
})
const selectedHtmlEditable = computed(() => {
  if (!props.editable || props.type !== 'Html' || !props.selectedHtmlEditableId) return null
  return getHtmlEditableSelection(rawHtmlContents.value, props.selectedHtmlEditableId)
})
const isHtmlTextSelection = computed(() => {
  const kind = selectedHtmlEditable.value?.kind
  return kind === 'text' || kind === 'link'
})
const currentHtmlTextFontFamily = computed(() => selectedHtmlEditable.value?.style?.fontFamily || htmlInlineFontOptions[0]?.value || '')
const htmlInlineFontOptionsForSelection = computed(() => {
  const current = currentHtmlTextFontFamily.value
  if (!current || htmlInlineFontOptions.some(font => font.value === current)) return htmlInlineFontOptions
  return [{ label: 'Current', value: current }, ...htmlInlineFontOptions]
})
const currentHtmlTextFontSize = computed(() => {
  const raw = selectedHtmlEditable.value?.style?.fontSize || ''
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? Math.max(10, Math.min(96, Math.round(value))) : 16
})
const currentHtmlTextFontWeight = computed(() => {
  const value = selectedHtmlEditable.value?.style?.fontWeight || ''
  const numeric = Number.parseInt(value, 10)
  if (value === 'bold' || (Number.isFinite(numeric) && numeric >= 600)) return 'bold'
  return 'normal'
})
const currentHtmlTextAlign = computed(() => selectedHtmlEditable.value?.style?.textAlign || 'left')
const currentHtmlTextColor = computed(() => selectedHtmlEditable.value?.style?.color || '#000000')
const htmlRegionToolbarStyle = computed(() => {
  const position = htmlRegionToolbarPosition.value
  if (!position) {
    return { left: '50%', top: '0px', transform: 'translate(-50%, -100%)' }
  }
  return {
    left: `${position.left}px`,
    top: `${position.top}px`,
    transform: 'translate(-50%, -100%)'
  }
})

function closestHtmlEditable(target: EventTarget | null): HTMLElement | null {
  if (!props.editable || props.type !== 'Html') return null
  const el = target as HTMLElement | null
  return el?.closest?.('[data-edm-html-editable-id]') as HTMLElement | null
}

function closestHtmlAnchor(target: EventTarget | null): HTMLElement | null {
  const el = target as HTMLElement | null
  return el?.closest?.('a[href]') as HTMLElement | null
}

function positionHtmlRegionToolbar(el: HTMLElement) {
  const wrap = htmlEditableWrapEl.value
  if (!wrap || typeof wrap.getBoundingClientRect !== 'function') return
  const wrapRect = wrap.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  htmlRegionToolbarPosition.value = {
    left: elRect.left - wrapRect.left + elRect.width / 2,
    top: Math.max(0, elRect.top - wrapRect.top - 8)
  }
}

function emitHtmlEditableUpdate(selection: EdmHtmlEditableSelection, update: Parameters<typeof updateHtmlEditable>[2]) {
  const next = updateHtmlEditable(rawHtmlContents.value, selection.id, update)
  if (next === rawHtmlContents.value) return
  emit('update:props', { contents: next })
  const nextSelection = getHtmlEditableSelection(next, selection.id)
  if (nextSelection) emit('select:html-editable', nextSelection)
}

function duplicateHtmlRegion(selection: EdmHtmlEditableSelection | null = selectedHtmlEditable.value) {
  if (!selection) return
  const next = duplicateHtmlEditable(rawHtmlContents.value, selection.id)
  if (next.contents === rawHtmlContents.value) return
  emit('update:props', { contents: next.contents })
  if (next.selection) emit('select:html-editable', next.selection)
}

function deleteHtmlRegion(selection: EdmHtmlEditableSelection | null = selectedHtmlEditable.value) {
  if (!selection) return
  const next = deleteHtmlEditable(rawHtmlContents.value, selection.id)
  if (next.contents === rawHtmlContents.value) return
  emit('update:props', { contents: next.contents })
  emit('select:html-editable', next.selection)
}

function updateHtmlTextStyle(stylePatch: Omit<Extract<EdmHtmlEditableUpdate, { kind: 'text' }>, 'kind'>) {
  const selection = selectedHtmlEditable.value
  if (!selection || (selection.kind !== 'text' && selection.kind !== 'link')) return
  emitHtmlEditableUpdate(selection, {
    kind: selection.kind,
    ...stylePatch
  } as Extract<EdmHtmlEditableUpdate, { kind: 'text' | 'link' }>)
}

function adjustHtmlTextFontSize(delta: 1 | -1) {
  updateHtmlTextStyle({ fontSize: `${Math.max(10, Math.min(96, currentHtmlTextFontSize.value + delta))}px` })
}

function onHtmlTextToolbarSelect(key: 'fontFamily' | 'fontWeight', e: Event) {
  const el = e.target as HTMLSelectElement | null
  if (!el) return
  updateHtmlTextStyle({ [key]: el.value })
}

function onHtmlTextToolbarColor(e: Event) {
  const el = e.target as HTMLInputElement | null
  if (!el) return
  updateHtmlTextStyle({ color: el.value || '#000000' })
}

function onHtmlEditableClick(event: MouseEvent) {
  const el = closestHtmlEditable(event.target)
  if (!el) return
  event.stopPropagation()
  positionHtmlRegionToolbar(el)
  const id = el.dataset.edmHtmlEditableId || ''
  const selection = getHtmlEditableSelection(rawHtmlContents.value, id)
  if (!selection) return
  if (selection.kind !== 'text' || closestHtmlAnchor(event.target)) event.preventDefault()
  emit('select:html-editable', selection)
}

function onHtmlEditableContextMenu(event: MouseEvent) {
  const el = closestHtmlEditable(event.target)
  if (!el) return
  const id = el.dataset.edmHtmlEditableId || ''
  const selection = getHtmlEditableSelection(rawHtmlContents.value, id)
  if (!selection || selection.kind !== 'image') return

  event.stopPropagation()
  event.preventDefault()
  positionHtmlRegionToolbar(el)
  emit('select:html-editable', selection)
  changeHtmlImage(selection)
}

function onHtmlEditableBlur(event: FocusEvent) {
  const el = closestHtmlEditable(event.target)
  if (!el) return
  const id = el.dataset.edmHtmlEditableId || ''
  const kind = el.dataset.edmHtmlEditableKind
  if (kind !== 'text' && kind !== 'link') return

  const next = updateHtmlEditable(rawHtmlContents.value, id, {
    kind,
    html: el.innerHTML
  })
  if (next === rawHtmlContents.value) return
  emit('update:props', { contents: next })
  const selection = getHtmlEditableSelection(next, id)
  if (selection) emit('select:html-editable', selection)
}

function changeHtmlImage(selection: EdmHtmlEditableSelection | null = selectedHtmlEditable.value) {
  if (!selection || selection.kind !== 'image') return
  if (props.imageLibraryEnabled) {
    emit('request:html-image-library', selection)
    return
  }
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return
  const nextSrc = window.prompt('Image URL', selection.src || '')
  if (nextSrc === null) return
  emitHtmlEditableUpdate(selection, { kind: 'image', src: nextSrc })
}

function editHtmlImageLink(selection: EdmHtmlEditableSelection | null = selectedHtmlEditable.value) {
  if (!selection || selection.kind !== 'image') return
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return
  const nextHref = window.prompt('Image link URL', selection.linkHref || '')
  if (nextHref === null) return
  emitHtmlEditableUpdate(selection, { kind: 'image', linkHref: nextHref })
}

function editHtmlLink(selection: EdmHtmlEditableSelection | null = selectedHtmlEditable.value) {
  if (!selection || selection.kind !== 'link') return
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return
  const nextHref = window.prompt('Link URL', selection.href || '')
  if (nextHref === null) return
  emitHtmlEditableUpdate(selection, { kind: 'link', href: nextHref })
}

function getPadding(p: unknown): string | undefined {
  if (!p || typeof p !== 'object') return undefined
  const pad = p as { top?: number, bottom?: number, left?: number, right?: number }
  return `${pad.top ?? 0}px ${pad.right ?? 0}px ${pad.bottom ?? 0}px ${pad.left ?? 0}px`
}

function buildBaseStyle(
  s: Record<string, unknown> | null | undefined
): Record<string, string | undefined> {
  if (!s) return {}
  return {
    color: (s.color as string) || undefined,
    backgroundColor: (s.backgroundColor as string) || undefined,
    fontFamily: (s.fontFamily as string) || undefined,
    fontSize: s.fontSize ? `${s.fontSize}px` : undefined,
    fontWeight: (s.fontWeight as string) || undefined,
    textAlign: (s.textAlign as string) || undefined,
    padding: getPadding(s.padding),
    // Phase 3a rich props (lineHeight, letterSpacing, textTransform, opacity,
    // border, borderRadius, boxShadow, backgroundImage) — omitted when absent.
    ...extendedStyleVue(s)
  }
}

const baseStyle = computed(() => buildBaseStyle(props.style))

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

const headingTag = computed(() => {
  const level = (blockProps.value.level as string) || 'h2'
  return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(level) ? level : 'h2'
})
const headingStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  fontWeight: (props.style?.fontWeight as string) || 'bold'
}))

const textStyle = computed(() => buildBaseStyle(props.style))

const buttonWrapperStyle = computed(() => ({
  backgroundColor: (props.style?.backgroundColor as string) || undefined,
  textAlign: (props.style?.textAlign as string) || undefined,
  padding: getPadding(props.style?.padding)
}))
const BUTTON_PADDING_BY_SIZE: Record<string, string> = {
  'x-small': '6px 12px',
  'small': '8px 16px',
  'medium': '12px 24px',
  'large': '16px 32px'
}
const BUTTON_RADIUS_BY_STYLE: Record<string, string> = {
  rectangle: '0',
  rounded: '8px',
  pill: '9999px'
}
const buttonLinkStyle = computed(() => {
  const bgColor = (blockProps.value.buttonBackgroundColor as string) || '#2f4574'
  const textColor = (blockProps.value.buttonTextColor as string) || '#ffffff'
  const base = buildBaseStyle(props.style)
  const size = (blockProps.value.size as string) || 'medium'
  const buttonStyle = (blockProps.value.buttonStyle as string) || 'rounded'
  const fullWidth = blockProps.value.fullWidth === true
  return {
    display: fullWidth ? 'block' : 'inline-block',
    width: fullWidth ? '100%' : undefined,
    boxSizing: fullWidth ? 'border-box' : undefined,
    padding: BUTTON_PADDING_BY_SIZE[size] || BUTTON_PADDING_BY_SIZE.medium,
    fontFamily: base.fontFamily,
    fontSize: base.fontSize || '16px',
    fontWeight: base.fontWeight || '600',
    letterSpacing: base.letterSpacing,
    lineHeight: base.lineHeight || '1',
    textTransform: base.textTransform,
    textAlign: fullWidth ? 'center' : undefined,
    textDecoration: 'none',
    backgroundColor: bgColor,
    color: textColor,
    border: base.border,
    borderRadius: base.borderRadius || BUTTON_RADIUS_BY_STYLE[buttonStyle] || BUTTON_RADIUS_BY_STYLE.rounded,
    boxShadow: base.boxShadow,
    opacity: base.opacity
  }
})

const imageWrapperStyle = computed(() => ({
  padding: getPadding(props.style?.padding),
  backgroundColor: (props.style?.backgroundColor as string) || undefined,
  textAlign: (props.style?.textAlign as string) || undefined
}))
const imageStyle = computed(() => ({
  maxWidth: '100%',
  height: 'auto',
  display: 'block',
  outline: 'none',
  border: 'none',
  ...(blockProps.value.width ? { width: `${blockProps.value.width}px` } : {}),
  ...(blockProps.value.height ? { height: `${blockProps.value.height}px` } : {})
}))

const avatarWrapperStyle = computed(() => ({
  textAlign: (props.style?.textAlign as string) || undefined,
  padding: getPadding(props.style?.padding)
}))
const avatarStyle = computed(() => {
  const size = (blockProps.value.size as number) || 64
  const shape = (blockProps.value.shape as string) || 'circle'
  return {
    width: `${size}px`,
    height: `${size}px`,
    objectFit: 'cover' as const,
    display: 'inline-block',
    verticalAlign: 'middle',
    borderRadius: shape === 'circle' ? '50%' : shape === 'rounded' ? '8px' : '0'
  }
})

const dividerWrapperStyle = computed(() => ({
  padding: getPadding(props.style?.padding),
  backgroundColor: (props.style?.backgroundColor as string) || undefined
}))
const dividerLineStyle = computed(() => ({
  width: '100%',
  border: 'none',
  borderTop: `${dividerLineThickness(blockProps.value)}px solid ${(blockProps.value.lineColor as string) || '#e5e7eb'}`,
  margin: '0'
}))

const headerStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: (blockProps.value.alignment as string) === 'left' ? 'flex-start' : (blockProps.value.alignment as string) === 'right' ? 'flex-end' : 'center',
  gap: '8px',
  minHeight: '72px',
  boxSizing: 'border-box'
}))
const headerLogoUrl = computed(() => asString(blockProps.value.logoUrl))
const headerTagline = computed(() => asString(blockProps.value.tagline) || 'Your brand')
const headerLogoStyle = computed(() => ({
  display: 'block',
  maxWidth: '180px',
  maxHeight: '60px',
  width: 'auto',
  height: 'auto',
  objectFit: 'contain' as const
}))
const headerTaglineStyle = computed(() => ({
  fontSize: '14px',
  lineHeight: '1.4',
  color: (props.style?.color as string) || '#6b7280',
  fontWeight: '500'
}))

const menuStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  display: 'flex',
  flexWrap: 'wrap' as const,
  justifyContent: 'center',
  alignItems: 'center',
  gap: '0',
  minHeight: '40px',
  boxSizing: 'border-box'
}))
const menuItems = computed(() => asArray<{ label?: string, url?: string }>(blockProps.value.items)
  .map(item => ({ label: asString(item.label), url: asString(item.url) }))
  .filter(item => item.label))
const menuSeparator = computed(() => asString(blockProps.value.separator) || '•')
const menuTextColor = computed(() => (props.style?.color as string) || '#111827')
const menuItemStyle = computed(() => ({
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: '14px',
  lineHeight: '1.4',
  color: menuTextColor.value,
  fontWeight: '500',
  whiteSpace: 'nowrap'
}))
const menuLinkStyle = computed(() => ({
  color: menuTextColor.value,
  textDecoration: 'none'
}))
const menuSeparatorStyle = {
  padding: '0 8px',
  color: '#9ca3af'
}

const heroImageUrl = computed(() => asString(blockProps.value.imageUrl))
const heroTextColor = computed(() => (blockProps.value.textColor as string) || '#ffffff')
const heroOverlayOpacity = computed(() => {
  const value = blockProps.value.overlayOpacity
  return typeof value === 'number' ? value : 0.4
})
const heroStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  minHeight: '180px',
  backgroundColor: (props.style?.backgroundColor as string) || '#1f2937',
  backgroundImage: heroImageUrl.value
    ? `linear-gradient(rgba(0, 0, 0, ${heroOverlayOpacity.value}), rgba(0, 0, 0, ${heroOverlayOpacity.value})), url("${heroImageUrl.value}")`
    : undefined,
  backgroundSize: heroImageUrl.value ? 'cover' : undefined,
  backgroundPosition: heroImageUrl.value ? 'center' : undefined,
  backgroundRepeat: heroImageUrl.value ? 'no-repeat' : undefined,
  color: heroTextColor.value,
  textAlign: 'center' as const,
  boxSizing: 'border-box'
}))
const heroHeading = computed(() => asString(blockProps.value.heading) || 'Hero headline')
const heroSubheading = computed(() => asString(blockProps.value.subheading))
const heroCtaText = computed(() => asString(blockProps.value.ctaText))
const heroHasCta = computed(() => heroCtaText.value.length > 0)
const heroHeadingStyle = computed(() => ({
  fontSize: '28px',
  lineHeight: '1.25',
  fontWeight: '700',
  color: heroTextColor.value,
  letterSpacing: '0',
  maxWidth: '100%',
  wordBreak: 'break-word' as const
}))
const heroSubheadingStyle = computed(() => ({
  fontSize: '16px',
  lineHeight: '1.5',
  color: heroTextColor.value,
  maxWidth: '520px',
  wordBreak: 'break-word' as const
}))
const heroCtaBackgroundColor = computed(() => (blockProps.value.ctaBackgroundColor as string) || '#ffffff')
const heroCtaTextColor = computed(() => (blockProps.value.ctaTextColor as string) || (props.style?.backgroundColor as string) || '#1f2937')
const heroCtaStyle = computed(() => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '40px',
  padding: '0 18px',
  borderRadius: '6px',
  backgroundColor: heroCtaBackgroundColor.value,
  color: heroCtaTextColor.value,
  fontSize: '15px',
  lineHeight: '1',
  fontWeight: '600',
  whiteSpace: 'nowrap' as const
}))

const featureColumnCount = computed(() => {
  const raw = Number(blockProps.value.columns ?? 3)
  if (!Number.isFinite(raw)) return 3
  return Math.max(1, Math.min(6, Math.trunc(raw)))
})
const featureGridStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  display: 'grid',
  gridTemplateColumns: `repeat(${featureColumnCount.value}, minmax(0, 1fr))`,
  gap: '12px',
  boxSizing: 'border-box'
}))
const featureItems = computed(() => asArray<{ icon?: string, heading?: string, description?: string }>(blockProps.value.features)
  .map(feature => ({
    icon: asString(feature.icon) || '•',
    heading: asString(feature.heading) || 'Feature',
    description: asString(feature.description)
  })))
const featureIconColor = computed(() => (blockProps.value.iconColor as string) || '#3b82f6')
const featureCardStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  textAlign: 'center' as const,
  gap: '6px',
  padding: '12px',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box'
}
const featureIconStyle = computed(() => ({
  fontSize: '28px',
  lineHeight: '1',
  color: featureIconColor.value
}))
const featureHeadingStyle = {
  fontSize: '15px',
  lineHeight: '1.35',
  fontWeight: '700',
  color: '#111827',
  wordBreak: 'break-word' as const
}
const featureDescriptionStyle = {
  fontSize: '13px',
  lineHeight: '1.45',
  color: '#6b7280',
  wordBreak: 'break-word' as const
}

const ctaBannerStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  minHeight: '140px',
  backgroundColor: (blockProps.value.backgroundColor as string) || '#1e40af',
  color: (blockProps.value.textColor as string) || '#ffffff',
  textAlign: 'center' as const,
  boxSizing: 'border-box'
}))
const ctaHeading = computed(() => asString(blockProps.value.heading) || 'Ready?')
const ctaSubheading = computed(() => asString(blockProps.value.subheading))
const ctaText = computed(() => asString(blockProps.value.ctaText) || 'Learn More')
const ctaBannerTextColor = computed(() => (blockProps.value.textColor as string) || '#ffffff')
const ctaHeadingStyle = computed(() => ({
  fontSize: '24px',
  lineHeight: '1.3',
  fontWeight: '700',
  color: ctaBannerTextColor.value,
  wordBreak: 'break-word' as const
}))
const ctaSubheadingStyle = computed(() => ({
  fontSize: '15px',
  lineHeight: '1.45',
  maxWidth: '520px',
  color: ctaBannerTextColor.value,
  wordBreak: 'break-word' as const
}))
const ctaBannerBackgroundColor = computed(() => (blockProps.value.backgroundColor as string) || '#1e40af')
const ctaTextBackgroundColor = computed(() => ctaBannerTextColor.value)
const ctaTextForegroundColor = computed(() => ctaBannerBackgroundColor.value)
const ctaTextStyle = computed(() => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '40px',
  padding: '0 18px',
  borderRadius: '8px',
  backgroundColor: ctaTextBackgroundColor.value,
  color: ctaTextForegroundColor.value,
  fontSize: '15px',
  lineHeight: '1',
  fontWeight: '600',
  whiteSpace: 'nowrap' as const
}))

const footerStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: '6px',
  textAlign: 'center' as const,
  minHeight: '80px',
  boxSizing: 'border-box'
}))
const footerAdditionalText = computed(() =>
  asString(blockProps.value.additionalText) || 'You are receiving this email because you subscribed to updates.'
)
const footerShowUnsubscribe = computed(() => blockProps.value.showUnsubscribe !== false)
const footerAdditionalTextStyle = {
  fontSize: '12px',
  lineHeight: '1.45',
  color: '#6b7280',
  wordBreak: 'break-word' as const
}
const footerUnsubscribeStyle = {
  fontSize: '12px',
  lineHeight: '1.45',
  color: '#6b7280',
  textDecoration: 'underline'
}

// Next steps — mirrors server next-steps block (heading + steps[{title, description}])
const nextStepsItems = computed(() =>
  asArray<{ title?: string, description?: string }>(blockProps.value.steps)
    .map(step => ({ title: asString(step.title) || 'Step', description: asString(step.description) }))
)
const nextStepsStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '14px',
  boxSizing: 'border-box'
}))
const nextStepsHeadingStyle = {
  fontSize: '20px',
  lineHeight: '1.3',
  fontWeight: '700',
  color: '#111827'
}
const nextStepsItemStyle = {
  display: 'flex',
  flexDirection: 'row' as const,
  alignItems: 'flex-start',
  gap: '12px'
}
const nextStepsNumberStyle = {
  flex: '0 0 auto',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: '#3b82f6',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '700',
  lineHeight: '28px',
  textAlign: 'center' as const
}
const nextStepsTitleStyle = {
  fontSize: '15px',
  lineHeight: '1.35',
  fontWeight: '700',
  color: '#111827',
  wordBreak: 'break-word' as const
}
const nextStepsDescriptionStyle = {
  fontSize: '14px',
  lineHeight: '1.4',
  color: '#6b7280',
  wordBreak: 'break-word' as const
}

// Container — representative empty padded box (thumbnail only; canvas has its own renderer)
const containerStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  minHeight: '56px',
  backgroundColor: (props.style?.backgroundColor as string) || '#ffffff',
  border: '1px dashed #d1d5db',
  borderRadius: '6px',
  boxSizing: 'border-box'
}))

// Columns container — representative placeholder cells (thumbnail only)
const columnsContainerCount = computed(() => {
  const raw = Number(blockProps.value.columnsCount ?? 2)
  if (!Number.isFinite(raw)) return 2
  return Math.max(1, Math.min(4, Math.trunc(raw)))
})
const columnsContainerStyle = computed(() => ({
  ...buildBaseStyle(props.style),
  display: 'flex',
  flexDirection: 'row' as const,
  gap: ((blockProps.value.columnsGap as number) ?? 16) + 'px',
  boxSizing: 'border-box'
}))
const columnsContainerCellStyle = {
  flex: '1 1 0',
  minHeight: '48px',
  backgroundColor: '#ffffff',
  border: '1px dashed #d1d5db',
  borderRadius: '6px',
  boxSizing: 'border-box' as const
}
</script>

<style scoped>
.edm-render-shell {
  display: contents;
}

.edm-hidden-on-device {
  display: block;
  filter: grayscale(0.35);
  opacity: 0.38;
  position: relative;
}

.edm-hidden-on-device::after {
  content: "Hidden on this device";
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--ui-text-muted);
  background: color-mix(in srgb, var(--ui-bg) 65%, transparent);
  font-size: 12px;
  font-weight: 600;
  pointer-events: none;
}

/* Inline-edit affordance (Phase 3b) — only present on the editable canvas, not
   in thumbnails/preview where `editable` is never set. */
.edm-editable {
  cursor: text;
  outline: none;
}
.edm-editable:hover {
  outline: 1px dashed rgba(59, 130, 246, 0.5);
  outline-offset: 2px;
}
.edm-editable:focus {
  outline: 2px solid rgb(59, 130, 246);
  outline-offset: 2px;
  border-radius: 2px;
}

.edm-html-block-wrap {
  position: relative;
}

.edm-html-region-toolbar {
  position: absolute;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 5px 6px;
  border: 1px solid var(--ui-border);
  border-radius: 9999px;
  background: var(--ui-bg);
  box-shadow: 0 10px 24px rgb(15 23 42 / 0.16);
}

.edm-html-region-toolbar-button {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--ui-text);
  cursor: pointer;
}

.edm-html-region-toolbar-button:hover,
.edm-html-region-toolbar-button:focus-visible {
  background: var(--ui-bg-muted);
  outline: none;
}

.edm-html-region-toolbar-button-danger {
  color: var(--ui-error, #dc2626);
}

.edm-html-region-toolbar-icon {
  width: 15px;
  height: 15px;
}

.edm-html-text-toolbar {
  gap: 2px;
  border-radius: 8px;
  white-space: nowrap;
}

.edm-html-text-toolbar .edm-inline-toolbar-color-popover {
  top: calc(100% + 8px);
}

:deep(.edm-html-editable) {
  cursor: text;
  outline: 1px dashed transparent;
  outline-offset: 2px;
  transition: outline-color 120ms ease, box-shadow 120ms ease;
}

:deep(.edm-html-editable[data-edm-html-editable-kind="image"]) {
  cursor: pointer;
}

:deep(.edm-html-editable:hover),
:deep(.edm-html-editable:focus),
:deep(.edm-html-editable.is-selected) {
  outline-color: rgb(59, 130, 246);
}

:deep(.edm-html-editable.is-selected) {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
}

.edm-rich-text-wrap {
  position: relative;
}

.edm-inline-toolbar {
  position: absolute;
  z-index: 5;
  bottom: calc(100% + 8px);
  left: 50%;
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 2px;
  max-width: min(760px, calc(100vw - 24px));
  padding: 4px 6px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  box-shadow: 0 8px 20px rgb(15 23 42 / 0.12);
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 4px);
  transition: opacity 120ms ease, transform 120ms ease;
  white-space: nowrap;
}

.edm-rich-text-wrap:hover .edm-inline-toolbar,
.edm-rich-text-wrap:focus-within .edm-inline-toolbar {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0);
}

.edm-inline-toolbar-button {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text);
  cursor: pointer;
}

.edm-inline-toolbar-button.is-active,
.edm-inline-toolbar-button:hover,
.edm-inline-toolbar-button:focus-visible {
  background: var(--ui-bg-muted);
  outline: none;
}

.edm-inline-toolbar-icon {
  width: 15px;
  height: 15px;
}

.edm-inline-toolbar-text-button {
  width: 30px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.edm-inline-toolbar-size {
  min-width: 28px;
  padding: 0 2px;
  color: var(--ui-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  text-align: center;
}

.edm-inline-toolbar-select {
  height: 26px;
  max-width: 118px;
  border: 1px solid var(--ui-border);
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 0 6px;
}

.edm-inline-toolbar-font {
  min-width: 104px;
}

.edm-inline-toolbar-divider {
  display: inline-block;
  width: 1px;
  height: 18px;
  margin: 0 3px;
  background: var(--ui-border);
}

.edm-inline-toolbar-color {
  position: relative;
}

.edm-inline-toolbar-swatch {
  width: 13px;
  height: 13px;
  border: 1px solid var(--ui-border);
  border-radius: 3px;
}

.edm-inline-toolbar-color-popover {
  position: absolute;
  z-index: 6;
  top: calc(100% + 6px);
  right: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  box-shadow: 0 10px 24px rgb(15 23 42 / 0.14);
}

.edm-inline-toolbar-color-input {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.edm-inline-toolbar-color-value {
  width: 82px;
  height: 28px;
  border: 1px solid var(--ui-border);
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  padding: 0 7px;
}
</style>
