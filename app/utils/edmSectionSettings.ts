export type EdmSectionSettingFieldType
  = | 'text'
    | 'textarea'
    | 'url'
    | 'color'
    | 'number'
    | 'boolean'
    | 'menu-items'
    | 'feature-items'

export interface EdmSectionSettingField {
  key: string
  label: string
  type: EdmSectionSettingFieldType
  placeholder?: string
  min?: number
  max?: number
  step?: number
}

export interface EdmSectionSettingsDefinition {
  type: string
  title: string
  fields: EdmSectionSettingField[]
}

const SECTION_SETTINGS: EdmSectionSettingsDefinition[] = [
  {
    type: 'header',
    title: 'Header',
    fields: [
      { key: 'logoUrl', label: 'Logo URL', type: 'url', placeholder: 'https://' },
      { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'Your brand' },
      { key: 'alignment', label: 'Alignment', type: 'text', placeholder: 'center' },
      { key: 'backgroundColor', label: 'Background color', type: 'color' }
    ]
  },
  {
    type: 'menu',
    title: 'Menu',
    fields: [
      { key: 'items', label: 'Menu items', type: 'menu-items' },
      { key: 'separator', label: 'Separator', type: 'text', placeholder: '•' }
    ]
  },
  {
    type: 'hero-section',
    title: 'Hero section',
    fields: [
      { key: 'imageUrl', label: 'Image URL', type: 'url', placeholder: 'https://' },
      { key: 'heading', label: 'Heading', type: 'text', placeholder: 'Campaign headline' },
      { key: 'subheading', label: 'Subheading', type: 'textarea' },
      { key: 'ctaText', label: 'CTA text', type: 'text', placeholder: 'Learn more' },
      { key: 'ctaUrl', label: 'CTA URL', type: 'url', placeholder: 'https://' },
      { key: 'overlayOpacity', label: 'Overlay opacity', type: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'textColor', label: 'Text color', type: 'color' }
    ]
  },
  {
    type: 'feature-grid',
    title: 'Feature grid',
    fields: [
      { key: 'features', label: 'Features', type: 'feature-items' },
      { key: 'columns', label: 'Columns', type: 'number', min: 1, max: 3, step: 1 },
      { key: 'iconColor', label: 'Icon color', type: 'color' }
    ]
  },
  {
    type: 'cta-banner',
    title: 'CTA banner',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'subheading', label: 'Subheading', type: 'textarea' },
      { key: 'ctaText', label: 'CTA text', type: 'text' },
      { key: 'ctaUrl', label: 'CTA URL', type: 'url', placeholder: 'https://' },
      { key: 'backgroundColor', label: 'Background color', type: 'color' },
      { key: 'textColor', label: 'Text color', type: 'color' }
    ]
  },
  {
    type: 'footer',
    title: 'Footer',
    fields: [
      { key: 'additionalText', label: 'Footer text', type: 'textarea' },
      { key: 'showUnsubscribe', label: 'Show unsubscribe', type: 'boolean' },
      { key: 'backgroundColor', label: 'Background color', type: 'color' }
    ]
  }
]

export function getEdmSectionSettings(type: string): EdmSectionSettingsDefinition | null {
  return SECTION_SETTINGS.find(section => section.type === type) ?? null
}
