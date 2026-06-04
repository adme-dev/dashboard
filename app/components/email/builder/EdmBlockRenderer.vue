<!-- app/components/email/builder/EdmBlockRenderer.vue -->
<!-- Stateless leaf renderer: block type/style/props → editor-preview markup.
     Ported from layers/edm/.../EdmBlockRenderer.vue (shadcn class re-skinned). -->
<template>
  <!-- Heading -->
  <component :is="headingTag" v-if="type === 'Heading'" :style="headingStyle">
    {{ blockProps.text || 'New Heading' }}
  </component>

  <!-- Text -->
  <div
    v-else-if="type === 'Text'"
    :style="textStyle"
    class="revert-browser-styles"
    v-html="blockProps.text || ''"
  />

  <!-- Button -->
  <div v-else-if="type === 'Button'" :style="buttonWrapperStyle">
    <a :href="(blockProps.url as string) || '#'" :style="buttonLinkStyle" target="_blank">
      {{ blockProps.text || 'Click Here' }}
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
    :style="baseStyle"
    class="revert-browser-styles"
    v-html="blockProps.contents || ''"
  />

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
      <div :style="featureHeadingStyle">
        {{ feature.heading }}
      </div>
      <div :style="featureDescriptionStyle">
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
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  type: string
  style?: Record<string, unknown> | null
  props?: Record<string, unknown> | null
}>()

const blockProps = computed(() => (props.props || {}) as Record<string, unknown>)

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
    padding: getPadding(s.padding)
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
const buttonLinkStyle = computed(() => {
  const bgColor = (blockProps.value.buttonBackgroundColor as string) || '#2f4574'
  const textColor = (blockProps.value.buttonTextColor as string) || '#ffffff'
  return {
    display: 'inline-block',
    padding: '12px 20px',
    fontSize: '16px',
    fontWeight: '600',
    textDecoration: 'none',
    backgroundColor: bgColor,
    color: textColor,
    borderRadius: '4px',
    lineHeight: '1'
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
  borderTop: `${(blockProps.value.lineHeight as number) || 1}px solid ${(blockProps.value.lineColor as string) || '#e5e7eb'}`,
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
