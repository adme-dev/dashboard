import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'
import { createEmptyDocument, generateBlockId } from '~~/app/types/edm'
import type { EdmFlyhubBlock, EdmFlyhubDocument } from '~~/app/types/edm'
import {
  picsum,
  heroImage,
  ctaBanner,
  featureRow,
  brandHeader,
  navMenu,
  richFooter,
  blogCardRow,
  clientLogoStrip,
  storyGrid,
  productCard,
  productRow,
  imageTextRow
} from '~~/app/utils/edmSectionBuilders'

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
  'header-logo-image',
  'header-announcement',
  'header-hero-image',
  'content-editorial-intro',
  'content-logo-grid',
  'content-image-story',
  'content-quote',
  'content-blog-cards',
  'content-top-stories',
  'content-client-logos',
  'content-feature-story',
  'content-newsletter-intro',
  'feature-icon-grid',
  'feature-two-up',
  'feature-checklist',
  'feature-three-col',
  'feature-image-set',
  'feature-spotlight',
  'cta-blue-banner',
  'cta-dark-banner',
  'cta-soft-banner',
  'cta-image-banner',
  'cta-accent-banner',
  'cta-split',
  'hero-dark-product',
  'ecommerce-product-row',
  'ecommerce-sale-banner',
  'ecommerce-product-grid',
  'ecommerce-product-card',
  'ecommerce-sale-hero',
  'ecommerce-two-up',
  'ecommerce-discount-banner',
  'transactional-next-steps',
  'transactional-receipt',
  'transactional-verify',
  'transactional-order-summary',
  'transactional-shipping',
  'transactional-welcome',
  'transactional-password-reset',
  'footer-legal',
  'footer-social',
  'footer-address',
  'footer-dark-social',
  'footer-app-download',
  'footer-newsletter-signup'
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
  },
  {
    id: 'header-logo-image',
    categoryId: 'header',
    kind: 'section',
    name: 'Logo + Nav',
    description: 'Image logo above a slash-separated navigation row.',
    icon: 'i-lucide-image',
    previewTone: 'light',
    blocks: [
      brandHeader({
        tagline: '',
        logoUrl: picsum('agency-logo', 160, 48),
        alignment: 'center',
        backgroundColor: '#ffffff',
        padding: { top: 24, right: 24, bottom: 8, left: 24 }
      }),
      navMenu({
        items: [
          { label: 'Work', url: '#' },
          { label: 'Services', url: '#' },
          { label: 'About', url: '#' },
          { label: 'Contact', url: '#' }
        ],
        separator: '/',
        color: '#0f172a',
        backgroundColor: '#ffffff',
        padding: { top: 4, right: 24, bottom: 18, left: 24 }
      })
    ]
  },
  {
    id: 'header-announcement',
    categoryId: 'header',
    kind: 'section',
    name: 'Announcement Bar',
    description: 'Accent banner announcing a launch or offer.',
    icon: 'i-lucide-megaphone',
    previewTone: 'accent',
    blocks: [
      block('header', {
        style: {
          padding: { top: 14, right: 24, bottom: 14, left: 24 },
          textAlign: 'center',
          backgroundColor: '#0f62fe',
          color: '#ffffff'
        },
        props: { logoUrl: '', tagline: 'New: campaign reporting is here', alignment: 'center', backgroundColor: '#0f62fe' }
      }),
      brandHeader({
        tagline: 'The Agency',
        alignment: 'center',
        backgroundColor: '#ffffff',
        color: '#111827',
        padding: { top: 22, right: 24, bottom: 18, left: 24 }
      })
    ]
  },
  {
    id: 'header-hero-image',
    categoryId: 'header',
    kind: 'section',
    name: 'Hero Image Header',
    description: 'Full-bleed image header with brand line and CTA.',
    icon: 'i-lucide-panels-top-left',
    previewTone: 'dark',
    blocks: [
      heroImage({
        heading: 'The Agency',
        subheading: 'Campaigns that move the numbers.',
        ctaText: 'See our work',
        ctaUrl: '#',
        imageSeed: 'header-hero',
        overlayOpacity: 0.45,
        padding: { top: 48, right: 32, bottom: 48, left: 32 }
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
  },
  {
    id: 'content-blog-cards',
    categoryId: 'content',
    kind: 'section',
    name: 'Blog Cards',
    description: 'Two image cards linking to your latest posts.',
    icon: 'i-lucide-layout-grid',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 28, right: 32, bottom: 8, left: 32 },
          textAlign: 'left',
          fontSize: 22,
          color: '#111827'
        },
        props: { level: 'h2', text: 'From the blog' }
      }),
      blogCardRow({
        cards: [
          { date: 'Strategy', title: 'How we cut a client’s cost per lead in half', imageSeed: 'blog-cpl' },
          { date: 'Creative', title: 'The hooks that made our last launch convert', imageSeed: 'blog-hooks' }
        ],
        accentColor: '#0ea5e9',
        padding: { top: 4, right: 24, bottom: 28, left: 24 }
      })
    ]
  },
  {
    id: 'content-top-stories',
    categoryId: 'content',
    kind: 'section',
    name: 'Top Stories',
    description: 'Image + heading + blurb story grid.',
    icon: 'i-lucide-newspaper',
    previewTone: 'light',
    blocks: [
      storyGrid({
        stories: [
          { heading: 'Inside the rebrand', blurb: 'A look at the strategy behind the refresh.', imageSeed: 'story-rebrand' },
          { heading: 'Q2 in numbers', blurb: 'The campaigns that beat their targets.', imageSeed: 'story-numbers' }
        ],
        columns: 2,
        padding: { top: 28, right: 24, bottom: 28, left: 24 }
      })
    ]
  },
  {
    id: 'content-client-logos',
    categoryId: 'content',
    kind: 'section',
    name: 'Our Clients',
    description: 'Logo strip of brands you work with.',
    icon: 'i-lucide-badge-check',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 28, right: 32, bottom: 4, left: 32 },
          textAlign: 'center',
          fontSize: 18,
          color: '#6b7280'
        },
        props: { level: 'h3', text: 'Trusted by teams like' }
      }),
      clientLogoStrip({
        brands: [
          { name: 'Northwind', imageSeed: 'logo-northwind' },
          { name: 'Brightly', imageSeed: 'logo-brightly' },
          { name: 'Harbor', imageSeed: 'logo-harbor' }
        ],
        columns: 3,
        padding: { top: 4, right: 32, bottom: 28, left: 32 }
      })
    ]
  },
  {
    id: 'content-feature-story',
    categoryId: 'content',
    kind: 'section',
    name: 'Feature Story',
    description: 'Image beside a headline, copy, and link.',
    icon: 'i-lucide-book-open',
    previewTone: 'light',
    blocks: [
      imageTextRow({
        heading: 'The campaign that doubled signups',
        text: 'We rebuilt the funnel from the first ad to the welcome email — here is how it played out.',
        ctaText: 'Read the story',
        ctaUrl: '#',
        imageSeed: 'feature-story',
        imageSide: 'left',
        padding: { top: 28, right: 24, bottom: 28, left: 24 }
      })
    ]
  },
  {
    id: 'content-newsletter-intro',
    categoryId: 'content',
    kind: 'section',
    name: 'Newsletter Intro',
    description: 'Friendly lead-in for a recurring update.',
    icon: 'i-lucide-mail',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 28, right: 32, bottom: 8, left: 32 },
          textAlign: 'left',
          fontSize: 24,
          color: '#111827'
        },
        props: { level: 'h1', text: 'Hello from the team' }
      }),
      block('Text', {
        style: {
          padding: { top: 0, right: 32, bottom: 24, left: 32 },
          textAlign: 'left',
          color: '#4b5563'
        },
        props: {
          text: 'Here is what we shipped, learned, and are excited about this month. Grab a coffee and dig in.'
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
  },
  {
    id: 'feature-three-col',
    categoryId: 'feature',
    kind: 'section',
    name: 'Three Pillars',
    description: 'Three-column overview of your core offering.',
    icon: 'i-lucide-columns-3',
    previewTone: 'light',
    blocks: [
      featureRow({
        features: [
          { icon: '◎', heading: 'Strategy', description: 'A plan tied to real goals.' },
          { icon: '✎', heading: 'Creative', description: 'On-brand assets that convert.' },
          { icon: '↗', heading: 'Growth', description: 'Channels tuned for results.' }
        ],
        columns: 3,
        iconColor: '#0ea5e9',
        padding: { top: 28, right: 24, bottom: 28, left: 24 }
      })
    ]
  },
  {
    id: 'feature-image-set',
    categoryId: 'feature',
    kind: 'section',
    name: 'Feature Showcase',
    description: 'Image-led story grid of capabilities.',
    icon: 'i-lucide-images',
    previewTone: 'light',
    blocks: [
      storyGrid({
        stories: [
          { heading: 'Campaign builder', blurb: 'Plan, brief, and ship in one place.', imageSeed: 'feat-builder' },
          { heading: 'Live reporting', blurb: 'See spend and results as they land.', imageSeed: 'feat-reporting' }
        ],
        columns: 2,
        padding: { top: 28, right: 24, bottom: 28, left: 24 }
      })
    ]
  },
  {
    id: 'feature-spotlight',
    categoryId: 'feature',
    kind: 'section',
    name: 'Feature Spotlight',
    description: 'Single feature with image, copy, and CTA.',
    icon: 'i-lucide-zap',
    previewTone: 'light',
    blocks: [
      imageTextRow({
        heading: 'Reporting that proves the work',
        text: 'Automated dashboards turn raw spend into a story your clients actually understand.',
        ctaText: 'See it live',
        ctaUrl: '#',
        imageSeed: 'feat-spotlight',
        imageSide: 'right',
        buttonColor: '#7c3aed',
        padding: { top: 28, right: 24, bottom: 28, left: 24 }
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
  },
  {
    id: 'cta-image-banner',
    categoryId: 'call-to-action',
    kind: 'section',
    name: 'Image CTA',
    description: 'Image-backed call to action with overlay text.',
    icon: 'i-lucide-image-plus',
    previewTone: 'dark',
    blocks: [
      heroImage({
        heading: 'Let’s build your next campaign',
        subheading: 'Book a free strategy session with the team.',
        ctaText: 'Book a call',
        ctaUrl: '#',
        imageSeed: 'cta-image',
        overlayOpacity: 0.5,
        padding: { top: 52, right: 32, bottom: 52, left: 32 }
      })
    ]
  },
  {
    id: 'cta-accent-banner',
    categoryId: 'call-to-action',
    kind: 'section',
    name: 'Accent CTA',
    description: 'Vibrant accent-colour call to action.',
    icon: 'i-lucide-sparkle',
    previewTone: 'accent',
    blocks: [
      ctaBanner({
        heading: 'Get the campaign playbook',
        subheading: 'Our step-by-step framework for high-performing launches.',
        ctaText: 'Download free',
        ctaUrl: '#',
        backgroundColor: '#7c3aed',
        textColor: '#ffffff'
      })
    ]
  },
  {
    id: 'cta-split',
    categoryId: 'call-to-action',
    kind: 'section',
    name: 'Split CTA',
    description: 'Image beside a heading, copy, and action button.',
    icon: 'i-lucide-square-split-horizontal',
    previewTone: 'light',
    blocks: [
      imageTextRow({
        heading: 'Ready when you are',
        text: 'Tell us your goals and we will map the first 90 days.',
        ctaText: 'Start the conversation',
        ctaUrl: '#',
        imageSeed: 'cta-split',
        imageSide: 'left',
        buttonColor: '#0f62fe',
        padding: { top: 28, right: 24, bottom: 28, left: 24 }
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
  },
  {
    id: 'ecommerce-product-grid',
    categoryId: 'e-commerce',
    kind: 'section',
    name: 'Product Grid',
    description: 'Three products with image, price, and shop button.',
    icon: 'i-lucide-layout-grid',
    previewTone: 'light',
    blocks: [
      productRow({
        products: [
          { name: 'Starter Kit', price: '$99', imageSeed: 'prod-starter' },
          { name: 'Growth Kit', price: '$249', imageSeed: 'prod-growth' },
          { name: 'Scale Kit', price: '$499', imageSeed: 'prod-scale' }
        ],
        columns: 3,
        buttonColor: '#0f766e',
        padding: { top: 28, right: 16, bottom: 28, left: 16 }
      })
    ]
  },
  {
    id: 'ecommerce-product-card',
    categoryId: 'e-commerce',
    kind: 'section',
    name: 'Single Product',
    description: 'One product hero with image, price, and CTA.',
    icon: 'i-lucide-package-2',
    previewTone: 'light',
    blocks: [
      productCard({
        name: 'Signature Campaign Kit',
        price: '$249',
        ctaText: 'Add to cart',
        ctaUrl: '#',
        imageSeed: 'prod-signature',
        buttonColor: '#0f766e',
        padding: { top: 28, right: 32, bottom: 28, left: 32 }
      })
    ]
  },
  {
    id: 'ecommerce-sale-hero',
    categoryId: 'e-commerce',
    kind: 'section',
    name: 'Sale Hero',
    description: 'Image-backed seasonal sale hero with CTA.',
    icon: 'i-lucide-flame',
    previewTone: 'dark',
    blocks: [
      heroImage({
        heading: 'Summer sale is on',
        subheading: 'Up to 30% off every package — this week only.',
        ctaText: 'Shop the sale',
        ctaUrl: '#',
        imageSeed: 'sale-hero',
        overlayOpacity: 0.45,
        padding: { top: 52, right: 32, bottom: 52, left: 32 }
      })
    ]
  },
  {
    id: 'ecommerce-two-up',
    categoryId: 'e-commerce',
    kind: 'section',
    name: 'Two-Up Picks',
    description: 'Two featured products as image cards.',
    icon: 'i-lucide-columns-2',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 28, right: 32, bottom: 8, left: 32 },
          textAlign: 'left',
          fontSize: 22,
          color: '#111827'
        },
        props: { level: 'h2', text: 'Picked for you' }
      }),
      productRow({
        products: [
          { name: 'Launch Bundle', price: '$349', imageSeed: 'pick-launch' },
          { name: 'Refresh Bundle', price: '$199', imageSeed: 'pick-refresh' }
        ],
        columns: 2,
        buttonColor: '#0f766e',
        padding: { top: 4, right: 16, bottom: 28, left: 16 }
      })
    ]
  },
  {
    id: 'ecommerce-discount-banner',
    categoryId: 'e-commerce',
    kind: 'section',
    name: 'Discount Banner',
    description: 'Coupon-style banner with promo code CTA.',
    icon: 'i-lucide-ticket-percent',
    previewTone: 'accent',
    blocks: [
      ctaBanner({
        heading: 'Take 15% off your first order',
        subheading: 'Use code WELCOME15 at checkout.',
        ctaText: 'Shop now',
        ctaUrl: '#',
        backgroundColor: '#0f766e',
        textColor: '#ffffff'
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
  },
  {
    id: 'transactional-order-summary',
    categoryId: 'transactional',
    kind: 'section',
    name: 'Order Summary',
    description: 'Itemised order table with a total row.',
    icon: 'i-lucide-table',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 28, right: 32, bottom: 8, left: 32 },
          textAlign: 'left',
          fontSize: 22,
          color: '#111827'
        },
        props: { level: 'h2', text: 'Your order summary' }
      }),
      block('Html', {
        style: {
          padding: { top: 0, right: 32, bottom: 28, left: 32 },
          backgroundColor: '#ffffff'
        },
        props: {
          contents:
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;color:#111827;">' +
            '<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">Campaign Kit</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e5e7eb;">$249.00</td></tr>' +
            '<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">Setup &amp; onboarding</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e5e7eb;">$49.00</td></tr>' +
            '<tr><td style="padding:12px 0;font-weight:700;">Total</td><td align="right" style="padding:12px 0;font-weight:700;">$298.00</td></tr>' +
            '</table>'
        }
      })
    ]
  },
  {
    id: 'transactional-shipping',
    categoryId: 'transactional',
    kind: 'section',
    name: 'Shipping Update',
    description: 'Status image beside a tracking message and link.',
    icon: 'i-lucide-truck',
    previewTone: 'light',
    blocks: [
      imageTextRow({
        heading: 'Your order is on the way',
        text: 'Order #10482 shipped today and should arrive within 3–5 business days.',
        ctaText: 'Track shipment',
        ctaUrl: '#',
        imageSeed: 'shipping',
        imageSide: 'left',
        buttonColor: '#0f766e',
        padding: { top: 28, right: 24, bottom: 28, left: 24 }
      })
    ]
  },
  {
    id: 'transactional-welcome',
    categoryId: 'transactional',
    kind: 'section',
    name: 'Welcome Aboard',
    description: 'Image-backed welcome hero for new accounts.',
    icon: 'i-lucide-party-popper',
    previewTone: 'dark',
    blocks: [
      heroImage({
        heading: 'Welcome aboard',
        subheading: 'Your account is ready — let’s get you set up.',
        ctaText: 'Get started',
        ctaUrl: '#',
        imageSeed: 'welcome',
        overlayOpacity: 0.45,
        padding: { top: 48, right: 32, bottom: 48, left: 32 }
      })
    ]
  },
  {
    id: 'transactional-password-reset',
    categoryId: 'transactional',
    kind: 'section',
    name: 'Password Reset',
    description: 'Secure reset prompt with a single action button.',
    icon: 'i-lucide-key-round',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 28, right: 32, bottom: 8, left: 32 },
          textAlign: 'center',
          fontSize: 22,
          color: '#111827'
        },
        props: { level: 'h2', text: 'Reset your password' }
      }),
      block('Text', {
        style: {
          padding: { top: 0, right: 40, bottom: 16, left: 40 },
          textAlign: 'center',
          color: '#4b5563'
        },
        props: {
          text: 'We received a request to reset your password. This link expires in 30 minutes.'
        }
      }),
      block('Button', {
        style: {
          padding: { top: 0, right: 24, bottom: 28, left: 24 },
          textAlign: 'center'
        },
        props: {
          text: 'Reset password',
          url: '#',
          buttonBackgroundColor: '#111827',
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
  },
  {
    id: 'footer-dark-social',
    categoryId: 'footer',
    kind: 'section',
    name: 'Dark Social Bar',
    description: 'Social links and legal text on a dark bar.',
    icon: 'i-lucide-share',
    previewTone: 'dark',
    blocks: [
      navMenu({
        items: [
          { label: 'Instagram', url: '#' },
          { label: 'LinkedIn', url: '#' },
          { label: 'YouTube', url: '#' },
          { label: 'X', url: '#' }
        ],
        separator: '·',
        color: '#d1d5db',
        backgroundColor: '#111827',
        padding: { top: 22, right: 24, bottom: 4, left: 24 }
      }),
      richFooter({
        additionalText: 'Follow along for more campaign updates.',
        showUnsubscribe: true,
        showAddress: false,
        backgroundColor: '#111827',
        color: '#9ca3af',
        padding: { top: 4, right: 32, bottom: 24, left: 32 }
      })
    ]
  },
  {
    id: 'footer-app-download',
    categoryId: 'footer',
    kind: 'section',
    name: 'App Download',
    description: 'Promote the mobile app above the legal footer.',
    icon: 'i-lucide-smartphone',
    previewTone: 'light',
    blocks: [
      block('Html', {
        style: {
          padding: { top: 24, right: 32, bottom: 8, left: 32 },
          backgroundColor: '#f5f5f5'
        },
        props: {
          contents:
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial,sans-serif;">' +
            '<tr><td align="center" style="padding:8px;font-size:15px;font-weight:700;color:#111827;">Get the app</td></tr>' +
            '<tr><td align="center" style="padding:8px;">' +
            `<img src="${picsum('app-store', 120, 40)}" alt="App Store" width="120" height="40" style="display:inline-block;margin:0 6px;border-radius:6px;" />` +
            `<img src="${picsum('play-store', 120, 40)}" alt="Google Play" width="120" height="40" style="display:inline-block;margin:0 6px;border-radius:6px;" />` +
            '</td></tr></table>'
        }
      }),
      richFooter({
        additionalText: 'You are receiving this email because you subscribed to updates.',
        showUnsubscribe: true,
        showAddress: false,
        backgroundColor: '#f5f5f5',
        color: '#6b7280',
        padding: { top: 4, right: 32, bottom: 24, left: 32 }
      })
    ]
  },
  {
    id: 'footer-newsletter-signup',
    categoryId: 'footer',
    kind: 'section',
    name: 'Newsletter Signup',
    description: 'Subscribe prompt with a CTA above the legal footer.',
    icon: 'i-lucide-mail-plus',
    previewTone: 'light',
    blocks: [
      block('Heading', {
        style: {
          padding: { top: 24, right: 32, bottom: 4, left: 32 },
          textAlign: 'center',
          fontSize: 18,
          color: '#111827'
        },
        props: { level: 'h3', text: 'Never miss an update' }
      }),
      block('Button', {
        style: {
          padding: { top: 4, right: 24, bottom: 8, left: 24 },
          textAlign: 'center'
        },
        props: {
          text: 'Subscribe',
          url: '#',
          buttonBackgroundColor: '#0ea5e9',
          buttonTextColor: '#ffffff'
        }
      }),
      richFooter({
        additionalText: 'Unsubscribe at any time from the link below.',
        showUnsubscribe: true,
        showAddress: false,
        backgroundColor: '#f5f5f5',
        color: '#6b7280',
        padding: { top: 4, right: 32, bottom: 24, left: 32 }
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
