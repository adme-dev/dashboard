import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'
import { createEmptyDocument, generateBlockId } from '~~/app/types/edm'
import type { EdmFlyhubBlock, EdmFlyhubDocument } from '~~/app/types/edm'

export type EdmSectionCategoryId =
  | 'basic'
  | 'header'
  | 'content'
  | 'feature'
  | 'call-to-action'
  | 'e-commerce'
  | 'transactional'
  | 'footer'

export type EdmPresetKind = 'block' | 'section'
export type EdmPreviewTone = 'light' | 'dark' | 'accent'

export interface EdmPresetBlockTemplate {
  type: string
  data: EdmFlyhubBlock['data']
}

export interface EdmSectionPreset {
  id: string
  categoryId: EdmSectionCategoryId
  kind: EdmPresetKind
  name: string
  description: string
  icon: string
  previewTone: EdmPreviewTone
  blocks: EdmPresetBlockTemplate[]
}

export interface EdmSectionCategory {
  id: EdmSectionCategoryId
  label: string
  icon: string
  presets: EdmSectionPreset[]
}

export interface EdmStarterTemplate {
  id: string
  name: string
  description: string
  usage: string
  style: string
  previewTone: EdmPreviewTone
  sectionPresetIds: readonly EdmSectionPresetId[]
  subject: string
  previewText: string
}

export interface EdmDocumentFragment {
  blocks: Record<string, EdmFlyhubBlock>
  rootChildrenIds: string[]
}

export const EDM_SECTION_PRESET_IDS = [
  'basic-heading',
  'basic-text',
  'basic-button',
  'basic-image',
  'basic-avatar',
  'basic-divider',
  'basic-spacer',
  'basic-html',
  'basic-columns-container',
  'basic-container',
  'header-logo-menu',
  'header-dark-brand',
  'content-editorial-intro',
  'content-logo-grid',
  'feature-icon-grid',
  'cta-blue-banner',
  'hero-dark-product',
  'transactional-next-steps',
  'footer-legal'
] as const

export type EdmSectionPresetId = typeof EDM_SECTION_PRESET_IDS[number]

interface NextStepItem {
  title: string
  description: string
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

function cloneBlockTemplate(template: EdmPresetBlockTemplate): EdmFlyhubBlock {
  return structuredClone(template)
}

function block(type: string, data: EdmFlyhubBlock['data']): EdmPresetBlockTemplate {
  return { type, data }
}

function basicPreset(type: string, name: string, icon: string): EdmSectionPreset {
  return {
    id: `basic-${toKebabCase(type)}`,
    categoryId: 'basic',
    kind: 'block',
    name,
    description: `Add a ${name.toLowerCase()} block from scratch.`,
    icon,
    previewTone: 'light',
    blocks: [block(type, getDefaultBlockData(type) as EdmFlyhubBlock['data'])]
  }
}

const BASIC_PRESETS = BLOCK_PALETTE.map(item => basicPreset(item.type, item.name, item.icon))

const HEADER_PRESETS: EdmSectionPreset[] = [
  {
    id: 'header-logo-menu',
    categoryId: 'header',
    kind: 'section',
    name: 'Logo + Menu',
    description: 'Centered brand header with simple navigation.',
    icon: 'i-lucide-panel-top',
    previewTone: 'light',
    blocks: [
      block('header', {
        style: {
          padding: { top: 24, right: 24, bottom: 8, left: 24 },
          textAlign: 'center',
          backgroundColor: '#ffffff'
        },
        props: { logoUrl: '', tagline: 'Your brand', alignment: 'center', backgroundColor: '#ffffff' }
      }),
      block('menu', {
        style: {
          padding: { top: 8, right: 24, bottom: 20, left: 24 },
          color: '#111827',
          backgroundColor: '#ffffff'
        },
        props: {
          separator: '•',
          items: [
            { label: 'Work', url: '#' },
            { label: 'Offers', url: '#' },
            { label: 'Contact', url: '#' }
          ]
        }
      })
    ]
  },
  {
    id: 'header-dark-brand',
    categoryId: 'header',
    kind: 'section',
    name: 'Dark Brand Header',
    description: 'Dark logo header for campaign launches.',
    icon: 'i-lucide-rectangle-ellipsis',
    previewTone: 'dark',
    blocks: [
      block('header', {
        style: {
          padding: { top: 28, right: 24, bottom: 28, left: 24 },
          textAlign: 'center',
          backgroundColor: '#171717'
        },
        props: { logoUrl: '', tagline: 'postcards', alignment: 'center', backgroundColor: '#171717' }
      })
    ]
  }
]

const CONTENT_PRESETS: EdmSectionPreset[] = [
  {
    id: 'content-editorial-intro',
    categoryId: 'content',
    kind: 'section',
    name: 'Editorial Intro',
    description: 'Headline, supporting copy, and CTA button.',
    icon: 'i-lucide-newspaper',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 28, right: 32, bottom: 8, left: 32 },
          textAlign: 'center',
          fontSize: 28,
          color: '#111827'
        },
        props: { level: 'h1', text: 'Weekly digest' }
      }),
      block('Text', {
        style: {
          padding: { top: 0, right: 40, bottom: 16, left: 40 },
          textAlign: 'center',
          color: '#4b5563'
        },
        props: {
          text: 'A concise update with the latest campaign, product, and client news.'
        }
      }),
      block('Button', {
        style: {
          padding: { top: 0, right: 24, bottom: 28, left: 24 },
          textAlign: 'center'
        },
        props: {
          text: 'Read the update',
          url: '#',
          buttonBackgroundColor: '#0ea5e9',
          buttonTextColor: '#ffffff'
        }
      })
    ]
  },
  {
    id: 'content-logo-grid',
    categoryId: 'content',
    kind: 'section',
    name: 'Logo Grid',
    description: 'Client or partner logo strip.',
    icon: 'i-lucide-grid-3x3',
    previewTone: 'light',
    blocks: [
      block('Html', {
        style: {
          padding: { top: 24, right: 32, bottom: 24, left: 32 },
          backgroundColor: '#ffffff'
        },
        props: {
          contents:
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">Microsoft</td><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">Google</td><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">Canon</td></tr><tr><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">Sony</td><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">Reebok</td><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">BBC</td></tr></table>'
        }
      })
    ]
  }
]

const FEATURE_PRESETS: EdmSectionPreset[] = [
  {
    id: 'feature-icon-grid',
    categoryId: 'feature',
    kind: 'section',
    name: 'Feature Grid',
    description: 'Three benefit cards with icons.',
    icon: 'i-lucide-sparkles',
    previewTone: 'light',
    blocks: [
      block('feature-grid', {
        style: {
          padding: { top: 28, right: 24, bottom: 28, left: 24 },
          backgroundColor: '#ffffff'
        },
        props: {
          columns: 3,
          iconColor: '#0ea5e9',
          features: [
            { icon: '•', heading: 'Plan', description: 'Map the launch.' },
            { icon: '•', heading: 'Build', description: 'Create the assets.' },
            { icon: '•', heading: 'Send', description: 'Reach the audience.' }
          ]
        }
      })
    ]
  }
]

const CTA_PRESETS: EdmSectionPreset[] = [
  {
    id: 'cta-blue-banner',
    categoryId: 'call-to-action',
    kind: 'section',
    name: 'Blue CTA',
    description: 'Full-width call to action.',
    icon: 'i-lucide-megaphone',
    previewTone: 'accent',
    blocks: [
      block('cta-banner', {
        style: {
          padding: { top: 32, right: 32, bottom: 32, left: 32 },
          fontFamily: 'MODERN_SANS'
        },
        props: {
          heading: 'Ready to launch?',
          subheading: 'Coordinate campaigns and product launches in one workflow.',
          ctaText: 'Start now',
          ctaUrl: '#',
          backgroundColor: '#0f62fe',
          textColor: '#ffffff'
        }
      })
    ]
  }
]

const ECOMMERCE_PRESETS: EdmSectionPreset[] = [
  {
    id: 'hero-dark-product',
    categoryId: 'e-commerce',
    kind: 'section',
    name: 'Offer Block',
    description: 'Promotion copy with clear CTA.',
    icon: 'i-lucide-shopping-cart',
    previewTone: 'dark',
    blocks: [
      block('hero-section', {
        style: { padding: { top: 54, right: 32, bottom: 54, left: 32 } },
        props: {
          imageUrl: '',
          heading: 'Limited-time offer',
          subheading: 'Get 20% off your next campaign package.',
          ctaText: 'Claim offer',
          ctaUrl: '#',
          overlayOpacity: 0.35,
          textColor: '#ffffff'
        }
      })
    ]
  }
]

const TRANSACTIONAL_PRESETS: EdmSectionPreset[] = [
  {
    id: 'transactional-next-steps',
    categoryId: 'transactional',
    kind: 'section',
    name: 'Next Steps',
    description: 'Utility-style confirmation section.',
    icon: 'i-lucide-list-checks',
    previewTone: 'light',
    blocks: [
      block('next-steps', {
        style: {
          padding: { top: 28, right: 32, bottom: 28, left: 32 },
          backgroundColor: '#f8fafc'
        },
        props: {
          steps: [
            { title: 'Review the details', description: 'Check the summary and confirm the request.' },
            { title: 'Confirm the schedule', description: 'Lock in the timing with the team.' },
            { title: 'Watch for the launch email', description: 'We will send the next update shortly.' }
          ] satisfies NextStepItem[]
        }
      })
    ]
  }
]

const FOOTER_PRESETS: EdmSectionPreset[] = [
  {
    id: 'footer-legal',
    categoryId: 'footer',
    kind: 'section',
    name: 'Legal Footer',
    description: 'Unsubscribe and compliance footer.',
    icon: 'i-lucide-panel-bottom',
    previewTone: 'light',
    blocks: [
      block('footer', {
        style: {
          padding: { top: 24, right: 32, bottom: 24, left: 32 },
          backgroundColor: '#f5f5f5'
        },
        props: {
          showUnsubscribe: true,
          showAddress: false,
          additionalText: 'You are receiving this email because you subscribed to updates.',
          backgroundColor: '#f5f5f5'
        }
      })
    ]
  }
]

export const EDM_SECTION_CATEGORIES: EdmSectionCategory[] = [
  { id: 'basic', label: 'Basic Modules', icon: 'i-lucide-box', presets: BASIC_PRESETS },
  { id: 'header', label: 'Header', icon: 'i-lucide-panel-top', presets: HEADER_PRESETS },
  { id: 'content', label: 'Content', icon: 'i-lucide-layout-list', presets: CONTENT_PRESETS },
  { id: 'feature', label: 'Feature', icon: 'i-lucide-sparkles', presets: FEATURE_PRESETS },
  {
    id: 'call-to-action',
    label: 'Call to action',
    icon: 'i-lucide-megaphone',
    presets: CTA_PRESETS
  },
  {
    id: 'e-commerce',
    label: 'E-Commerce',
    icon: 'i-lucide-shopping-cart',
    presets: ECOMMERCE_PRESETS
  },
  {
    id: 'transactional',
    label: 'Transactional',
    icon: 'i-lucide-receipt-text',
    presets: TRANSACTIONAL_PRESETS
  },
  { id: 'footer', label: 'Footer', icon: 'i-lucide-panel-bottom', presets: FOOTER_PRESETS }
]

export const EDM_STARTER_TEMPLATES: EdmStarterTemplate[] = [
  {
    id: 'newsletter-digest',
    name: 'Weekly Digest',
    description: 'Editorial newsletter with header, intro, features, CTA, and footer.',
    usage: 'Newsletter',
    style: 'Editorial',
    previewTone: 'dark',
    sectionPresetIds: [
      'header-logo-menu',
      'content-editorial-intro',
      'feature-icon-grid',
      'cta-blue-banner',
      'footer-legal'
    ],
    subject: 'Weekly digest',
    previewText: 'Latest updates from the team'
  },
  {
    id: 'product-offer',
    name: 'Product Offer',
    description: 'Promotional product email with hero offer and CTA.',
    usage: 'Promotion',
    style: 'Retail',
    previewTone: 'accent',
    sectionPresetIds: [
      'header-dark-brand',
      'hero-dark-product',
      'feature-icon-grid',
      'cta-blue-banner',
      'footer-legal'
    ],
    subject: 'Limited-time offer',
    previewText: 'A new campaign offer is ready'
  },
  {
    id: 'confirmation-update',
    name: 'Confirmation Update',
    description: 'Transactional update with practical next steps.',
    usage: 'Transactional',
    style: 'Utility',
    previewTone: 'light',
    sectionPresetIds: ['header-logo-menu', 'transactional-next-steps', 'footer-legal'],
    subject: 'Your update is confirmed',
    previewText: 'Here is what happens next'
  }
]

const ALL_SECTION_PRESETS = EDM_SECTION_CATEGORIES.flatMap(category => category.presets)

export function findSectionPreset(id: string): EdmSectionPreset | null {
  return ALL_SECTION_PRESETS.find(preset => preset.id === id) ?? null
}

export function findStarterTemplate(id: string): EdmStarterTemplate | null {
  return EDM_STARTER_TEMPLATES.find(template => template.id === id) ?? null
}

export function buildSectionDocumentFragment(sectionPresetId: string): EdmDocumentFragment {
  const preset = findSectionPreset(sectionPresetId)
  if (!preset) {
    throw new Error(`unknown_edm_section_preset:${sectionPresetId}`)
  }

  const blocks: Record<string, EdmFlyhubBlock> = {}
  const rootChildrenIds: string[] = []

  for (const template of preset.blocks) {
    const id = generateBlockId()
    blocks[id] = cloneBlockTemplate(template)
    rootChildrenIds.push(id)
  }

  return { blocks, rootChildrenIds }
}

export function buildStarterTemplateDocument(starterTemplateId: string): EdmFlyhubDocument {
  const starter = findStarterTemplate(starterTemplateId)
  if (!starter) {
    throw new Error(`unknown_edm_starter_template:${starterTemplateId}`)
  }

  const document = createEmptyDocument()
  document.root.data.props = {
    ...document.root.data.props,
    backdropColor: '#EEF3F6',
    canvasColor: '#FFFFFF',
    textColor: '#111827',
    fontFamily: 'MODERN_SANS'
  }
  document.root.data.childrenIds = []

  for (const sectionPresetId of starter.sectionPresetIds) {
    const fragment = buildSectionDocumentFragment(sectionPresetId)
    Object.assign(document, fragment.blocks)
    document.root.data.childrenIds.push(...fragment.rootChildrenIds)
  }

  return document
}
