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
  'header-minimal',
  'header-nav-bar',
  'content-editorial-intro',
  'content-logo-grid',
  'content-image-story',
  'content-quote',
  'feature-icon-grid',
  'feature-two-up',
  'feature-checklist',
  'cta-blue-banner',
  'cta-dark-banner',
  'cta-soft-banner',
  'hero-dark-product',
  'ecommerce-product-row',
  'ecommerce-sale-banner',
  'transactional-next-steps',
  'transactional-receipt',
  'transactional-verify',
  'footer-legal',
  'footer-social',
  'footer-address'
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
  },
  {
    id: 'header-minimal',
    categoryId: 'header',
    kind: 'section',
    name: 'Minimal Wordmark',
    description: 'Left-aligned wordmark with a thin divider.',
    icon: 'i-lucide-minus',
    previewTone: 'light',
    blocks: [
      block('header', {
        style: {
          padding: { top: 24, right: 28, bottom: 12, left: 28 },
          textAlign: 'left',
          color: '#111827',
          backgroundColor: '#ffffff'
        },
        props: { logoUrl: '', tagline: 'XeroFlow', alignment: 'left', backgroundColor: '#ffffff' }
      }),
      block('Divider', {
        style: {
          padding: { top: 0, right: 28, bottom: 8, left: 28 },
          backgroundColor: '#ffffff'
        },
        props: { lineColor: '#e5e7eb', lineHeight: 1 }
      })
    ]
  },
  {
    id: 'header-nav-bar',
    categoryId: 'header',
    kind: 'section',
    name: 'Navigation Bar',
    description: 'Brand line above a four-link navigation row.',
    icon: 'i-lucide-navigation',
    previewTone: 'light',
    blocks: [
      block('header', {
        style: {
          padding: { top: 20, right: 24, bottom: 4, left: 24 },
          textAlign: 'center',
          backgroundColor: '#f8fafc'
        },
        props: { logoUrl: '', tagline: 'The Agency', alignment: 'center', backgroundColor: '#f8fafc' }
      }),
      block('menu', {
        style: {
          padding: { top: 4, right: 24, bottom: 18, left: 24 },
          color: '#0f172a',
          backgroundColor: '#f8fafc'
        },
        props: {
          separator: '/',
          items: [
            { label: 'Services', url: '#' },
            { label: 'Case Studies', url: '#' },
            { label: 'Pricing', url: '#' },
            { label: 'Book a Call', url: '#' }
          ]
        }
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
  },
  {
    id: 'content-image-story',
    categoryId: 'content',
    kind: 'section',
    name: 'Image Story',
    description: 'Hero image with a headline and short narrative.',
    icon: 'i-lucide-image',
    previewTone: 'light',
    blocks: [
      block('Image', {
        style: {
          padding: { top: 24, right: 32, bottom: 16, left: 32 },
          textAlign: 'center',
          backgroundColor: '#ffffff'
        },
        props: { url: 'https://placehold.co/600x400/f5f5f5/ccc?text=Your+Image', alt: 'Campaign story image' }
      }),
      block('Heading', {
        style: {
          padding: { top: 0, right: 32, bottom: 8, left: 32 },
          textAlign: 'left',
          fontSize: 24,
          color: '#111827'
        },
        props: { level: 'h2', text: 'Behind the campaign' }
      }),
      block('Text', {
        style: {
          padding: { top: 0, right: 32, bottom: 24, left: 32 },
          textAlign: 'left',
          color: '#4b5563'
        },
        props: {
          text: 'See how the team turned a single brief into a multi-channel launch that landed on time and on budget.'
        }
      })
    ]
  },
  {
    id: 'content-quote',
    categoryId: 'content',
    kind: 'section',
    name: 'Pull Quote',
    description: 'Centered client quote with attribution.',
    icon: 'i-lucide-quote',
    previewTone: 'accent',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 32, right: 40, bottom: 8, left: 40 },
          textAlign: 'center',
          fontSize: 22,
          color: '#0f172a'
        },
        props: { level: 'h3', text: '“The launch beat every benchmark we set.”' }
      }),
      block('Text', {
        style: {
          padding: { top: 0, right: 40, bottom: 32, left: 40 },
          textAlign: 'center',
          color: '#64748b'
        },
        props: { text: 'Head of Marketing, Retail Partner' }
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
  },
  {
    id: 'feature-two-up',
    categoryId: 'feature',
    kind: 'section',
    name: 'Two-Up Benefits',
    description: 'Two side-by-side benefit cards.',
    icon: 'i-lucide-columns-2',
    previewTone: 'light',
    blocks: [
      block('feature-grid', {
        style: {
          padding: { top: 28, right: 32, bottom: 28, left: 32 },
          backgroundColor: '#ffffff'
        },
        props: {
          columns: 2,
          iconColor: '#7c3aed',
          features: [
            { icon: '★', heading: 'Strategy', description: 'A clear plan tied to your goals.' },
            { icon: '⚡', heading: 'Delivery', description: 'Assets shipped fast, every sprint.' }
          ]
        }
      })
    ]
  },
  {
    id: 'feature-checklist',
    categoryId: 'feature',
    kind: 'section',
    name: "What's Included",
    description: 'Headline above a four-point checklist.',
    icon: 'i-lucide-list-checks',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 28, right: 32, bottom: 8, left: 32 },
          textAlign: 'center',
          fontSize: 22,
          color: '#111827'
        },
        props: { level: 'h2', text: "What's included" }
      }),
      block('feature-grid', {
        style: {
          padding: { top: 8, right: 24, bottom: 28, left: 24 },
          backgroundColor: '#ffffff'
        },
        props: {
          columns: 2,
          iconColor: '#10b981',
          features: [
            { icon: '✓', heading: 'Audience research', description: 'Targeting built on real data.' },
            { icon: '✓', heading: 'Creative production', description: 'On-brand designs and copy.' },
            { icon: '✓', heading: 'Multi-channel launch', description: 'Email, social, and ads.' },
            { icon: '✓', heading: 'Reporting', description: 'Clear results after every send.' }
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
  },
  {
    id: 'cta-dark-banner',
    categoryId: 'call-to-action',
    kind: 'section',
    name: 'Dark CTA',
    description: 'High-contrast dark call to action.',
    icon: 'i-lucide-mouse-pointer-click',
    previewTone: 'dark',
    blocks: [
      block('cta-banner', {
        style: {
          padding: { top: 36, right: 32, bottom: 36, left: 32 },
          fontFamily: 'MODERN_SANS'
        },
        props: {
          heading: 'Book your strategy call',
          subheading: 'Spend 30 minutes with our team and leave with a plan.',
          ctaText: 'Schedule now',
          ctaUrl: '#',
          backgroundColor: '#111827',
          textColor: '#ffffff'
        }
      })
    ]
  },
  {
    id: 'cta-soft-banner',
    categoryId: 'call-to-action',
    kind: 'section',
    name: 'Soft Invite',
    description: 'Light, low-pressure call to action.',
    icon: 'i-lucide-hand',
    previewTone: 'light',
    blocks: [
      block('cta-banner', {
        style: {
          padding: { top: 32, right: 32, bottom: 32, left: 32 },
          fontFamily: 'MODERN_SANS'
        },
        props: {
          heading: 'Want the full case study?',
          subheading: 'We will send the breakdown straight to your inbox.',
          ctaText: 'Send it over',
          ctaUrl: '#',
          backgroundColor: '#eef2ff',
          textColor: '#1e3a8a'
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
  },
  {
    id: 'ecommerce-product-row',
    categoryId: 'e-commerce',
    kind: 'section',
    name: 'Product Spotlight',
    description: 'Product image, name, price, and buy button.',
    icon: 'i-lucide-package',
    previewTone: 'light',
    blocks: [
      block('Image', {
        style: {
          padding: { top: 28, right: 32, bottom: 12, left: 32 },
          textAlign: 'center',
          backgroundColor: '#ffffff'
        },
        props: { url: 'https://placehold.co/600x400/f5f5f5/ccc?text=Your+Image', alt: 'Featured product' }
      }),
      block('Heading', {
        style: {
          padding: { top: 0, right: 32, bottom: 4, left: 32 },
          textAlign: 'center',
          fontSize: 20,
          color: '#111827'
        },
        props: { level: 'h3', text: 'Signature Campaign Kit' }
      }),
      block('Text', {
        style: {
          padding: { top: 0, right: 32, bottom: 12, left: 32 },
          textAlign: 'center',
          color: '#0f766e',
          fontWeight: 'bold'
        },
        props: { text: '$249' }
      }),
      block('Button', {
        style: {
          padding: { top: 0, right: 24, bottom: 28, left: 24 },
          textAlign: 'center'
        },
        props: {
          text: 'Add to cart',
          url: '#',
          buttonBackgroundColor: '#0f766e',
          buttonTextColor: '#ffffff'
        }
      })
    ]
  },
  {
    id: 'ecommerce-sale-banner',
    categoryId: 'e-commerce',
    kind: 'section',
    name: 'Sale Banner',
    description: 'Bold seasonal-sale promo banner.',
    icon: 'i-lucide-tag',
    previewTone: 'accent',
    blocks: [
      block('cta-banner', {
        style: {
          padding: { top: 36, right: 32, bottom: 36, left: 32 },
          fontFamily: 'MODERN_SANS'
        },
        props: {
          heading: 'Spring sale — 30% off',
          subheading: 'Save on every campaign package through the end of the month.',
          ctaText: 'Shop the sale',
          ctaUrl: '#',
          backgroundColor: '#be123c',
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
  },
  {
    id: 'transactional-receipt',
    categoryId: 'transactional',
    kind: 'section',
    name: 'Order Receipt',
    description: 'Confirmation heading with order summary and link.',
    icon: 'i-lucide-receipt',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 28, right: 32, bottom: 8, left: 32 },
          textAlign: 'left',
          fontSize: 22,
          color: '#111827'
        },
        props: { level: 'h2', text: 'Thanks for your order' }
      }),
      block('Text', {
        style: {
          padding: { top: 0, right: 32, bottom: 12, left: 32 },
          textAlign: 'left',
          color: '#4b5563'
        },
        props: {
          text: 'Order #10482 — Campaign Kit · $249.00. A copy of this receipt has been emailed to you.'
        }
      }),
      block('Divider', {
        style: {
          padding: { top: 0, right: 32, bottom: 12, left: 32 },
          backgroundColor: '#ffffff'
        },
        props: { lineColor: '#e5e7eb', lineHeight: 1 }
      }),
      block('Button', {
        style: {
          padding: { top: 0, right: 32, bottom: 28, left: 32 },
          textAlign: 'left'
        },
        props: {
          text: 'View order',
          url: '#',
          buttonBackgroundColor: '#111827',
          buttonTextColor: '#ffffff'
        }
      })
    ]
  },
  {
    id: 'transactional-verify',
    categoryId: 'transactional',
    kind: 'section',
    name: 'Verify Email',
    description: 'Account verification prompt with action button.',
    icon: 'i-lucide-mail-check',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 28, right: 32, bottom: 8, left: 32 },
          textAlign: 'center',
          fontSize: 22,
          color: '#111827'
        },
        props: { level: 'h2', text: 'Confirm your email address' }
      }),
      block('Text', {
        style: {
          padding: { top: 0, right: 40, bottom: 16, left: 40 },
          textAlign: 'center',
          color: '#4b5563'
        },
        props: {
          text: 'Tap the button below to verify your address and finish setting up your account.'
        }
      }),
      block('Button', {
        style: {
          padding: { top: 0, right: 24, bottom: 28, left: 24 },
          textAlign: 'center'
        },
        props: {
          text: 'Verify email',
          url: '#',
          buttonBackgroundColor: '#2563eb',
          buttonTextColor: '#ffffff'
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
  },
  {
    id: 'footer-social',
    categoryId: 'footer',
    kind: 'section',
    name: 'Social Footer',
    description: 'Social links above the legal footer.',
    icon: 'i-lucide-share-2',
    previewTone: 'light',
    blocks: [
      block('menu', {
        style: {
          padding: { top: 20, right: 24, bottom: 4, left: 24 },
          color: '#6b7280',
          backgroundColor: '#f5f5f5'
        },
        props: {
          separator: '·',
          items: [
            { label: 'Instagram', url: '#' },
            { label: 'LinkedIn', url: '#' },
            { label: 'YouTube', url: '#' }
          ]
        }
      }),
      block('footer', {
        style: {
          padding: { top: 4, right: 32, bottom: 24, left: 32 },
          backgroundColor: '#f5f5f5'
        },
        props: {
          showUnsubscribe: true,
          showAddress: false,
          additionalText: 'Follow along for more campaign updates.',
          backgroundColor: '#f5f5f5'
        }
      })
    ]
  },
  {
    id: 'footer-address',
    categoryId: 'footer',
    kind: 'section',
    name: 'Address Footer',
    description: 'Mailing address with unsubscribe link.',
    icon: 'i-lucide-map-pin',
    previewTone: 'dark',
    blocks: [
      block('footer', {
        style: {
          padding: { top: 24, right: 32, bottom: 24, left: 32 },
          backgroundColor: '#111827',
          color: '#9ca3af'
        },
        props: {
          showUnsubscribe: true,
          showAddress: false,
          additionalText: 'The Agency · 100 George St, Sydney NSW 2000, Australia',
          backgroundColor: '#111827'
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
