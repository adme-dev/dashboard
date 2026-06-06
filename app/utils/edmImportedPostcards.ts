// Generated from local Postcards exports in ~/Downloads on 2026-06-05.
// The complete exports are split into Html-backed sections so they can be
// assembled as starter templates and reused in the section library.

import { POSTCARDS_IMPORTED_HTML } from '~~/app/utils/edmImportedPostcardsHtml.js'
import type { EdmSectionPreset, EdmStarterTemplate } from '~~/app/utils/edmPresets'

function importedHtmlBlock(contents: string) {
  return {
    type: 'Html',
    data: {
      style: {
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        backgroundColor: '#ffffff'
      },
      props: { contents }
    }
  }
}

function importedLegalFooterBlock() {
  return {
    type: 'footer',
    data: {
      style: {
        padding: { top: 20, right: 32, bottom: 24, left: 32 },
        backgroundColor: '#f5f5f5'
      },
      props: {
        showUnsubscribe: true,
        showAddress: false,
        additionalText: 'The Agency · 100 George St, Sydney NSW 2000, Australia. You are receiving this email because you subscribed to updates.',
        backgroundColor: '#f5f5f5'
      }
    }
  }
}

export const IMPORTED_POSTCARDS_SECTION_IDS = [
  "postcards-glidex-01-brand",
  "postcards-glidex-02-hero",
  "postcards-glidex-03-offer",
  "postcards-glidex-04-connectivity",
  "postcards-glidex-05-safety",
  "postcards-glidex-06-cta",
  "postcards-glidex-07-footer",
  "postcards-futurax-01-hero",
  "postcards-futurax-02-model",
  "postcards-futurax-03-design",
  "postcards-futurax-04-reserve",
  "postcards-futurax-05-footer",
  "postcards-aviro-01-nav",
  "postcards-aviro-02-hero",
  "postcards-aviro-03-cart",
  "postcards-aviro-04-benefits",
  "postcards-aviro-05-cta",
  "postcards-aviro-06-categories",
  "postcards-aviro-07-footer"
] as const

export const IMPORTED_POSTCARDS_SECTION_PRESETS: EdmSectionPreset[] = [
  {
    id: "postcards-glidex-01-brand",
    categoryId: "imported",
    kind: "section",
    name: "GlideX Brand Header",
    description: "Compact GlideX brand mark header.",
    icon: "i-lucide-panel-top",
    previewTone: "dark",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-glidex-01-brand"] || '')]
  },
  {
    id: "postcards-glidex-02-hero",
    categoryId: "imported",
    kind: "section",
    name: "GlideX Hero",
    description: "Dark automotive hero with a product image.",
    icon: "i-lucide-car-front",
    previewTone: "dark",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-glidex-02-hero"] || '')]
  },
  {
    id: "postcards-glidex-03-offer",
    categoryId: "imported",
    kind: "section",
    name: "GlideX Offer Bullets",
    description: "Limited-time offer with benefit bullets.",
    icon: "i-lucide-badge-percent",
    previewTone: "dark",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-glidex-03-offer"] || '')]
  },
  {
    id: "postcards-glidex-04-connectivity",
    categoryId: "imported",
    kind: "section",
    name: "GlideX Connectivity Feature",
    description: "Two-column product benefits section.",
    icon: "i-lucide-radio-tower",
    previewTone: "light",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-glidex-04-connectivity"] || '')]
  },
  {
    id: "postcards-glidex-05-safety",
    categoryId: "imported",
    kind: "section",
    name: "GlideX Safety Features",
    description: "Safety feature cards with image support.",
    icon: "i-lucide-shield-check",
    previewTone: "light",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-glidex-05-safety"] || '')]
  },
  {
    id: "postcards-glidex-06-cta",
    categoryId: "imported",
    kind: "section",
    name: "GlideX Upgrade CTA",
    description: "Full-width upgrade call to action.",
    icon: "i-lucide-rocket",
    previewTone: "dark",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-glidex-06-cta"] || '')]
  },
  {
    id: "postcards-glidex-07-footer",
    categoryId: "imported",
    kind: "section",
    name: "GlideX Footer",
    description: "Brand footer with links and preferences.",
    icon: "i-lucide-panel-bottom",
    previewTone: "light",
    blocks: [
      importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-glidex-07-footer"] || ''),
      importedLegalFooterBlock()
    ]
  },
  {
    id: "postcards-futurax-01-hero",
    categoryId: "imported",
    kind: "section",
    name: "FuturaX Reserve Hero",
    description: "Reservation hero with brand navigation.",
    icon: "i-lucide-car-front",
    previewTone: "dark",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-futurax-01-hero"] || '')]
  },
  {
    id: "postcards-futurax-02-model",
    categoryId: "imported",
    kind: "section",
    name: "FuturaX Model Intro",
    description: "Vehicle intro with a large image.",
    icon: "i-lucide-image",
    previewTone: "light",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-futurax-02-model"] || '')]
  },
  {
    id: "postcards-futurax-03-design",
    categoryId: "imported",
    kind: "section",
    name: "FuturaX Design Feature",
    description: "Design highlight with supporting image.",
    icon: "i-lucide-sparkles",
    previewTone: "light",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-futurax-03-design"] || '')]
  },
  {
    id: "postcards-futurax-04-reserve",
    categoryId: "imported",
    kind: "section",
    name: "FuturaX Reserve CTA",
    description: "Simple reserve-now call to action.",
    icon: "i-lucide-calendar-check",
    previewTone: "light",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-futurax-04-reserve"] || '')]
  },
  {
    id: "postcards-futurax-05-footer",
    categoryId: "imported",
    kind: "section",
    name: "FuturaX Footer",
    description: "FuturaX legal footer with navigation links.",
    icon: "i-lucide-panel-bottom",
    previewTone: "light",
    blocks: [
      importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-futurax-05-footer"] || ''),
      importedLegalFooterBlock()
    ]
  },
  {
    id: "postcards-aviro-01-nav",
    categoryId: "imported",
    kind: "section",
    name: "Aviro Navigation Header",
    description: "Aviro store navigation header.",
    icon: "i-lucide-panel-top",
    previewTone: "dark",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-aviro-01-nav"] || '')]
  },
  {
    id: "postcards-aviro-02-hero",
    categoryId: "imported",
    kind: "section",
    name: "Aviro Launch Hero",
    description: "Bold bicycle launch hero section.",
    icon: "i-lucide-bike",
    previewTone: "dark",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-aviro-02-hero"] || '')]
  },
  {
    id: "postcards-aviro-03-cart",
    categoryId: "imported",
    kind: "section",
    name: "Aviro Cart Summary",
    description: "Shopping cart order summary section.",
    icon: "i-lucide-shopping-cart",
    previewTone: "dark",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-aviro-03-cart"] || '')]
  },
  {
    id: "postcards-aviro-04-benefits",
    categoryId: "imported",
    kind: "section",
    name: "Aviro Benefits",
    description: "Three benefit cards for bicycle shoppers.",
    icon: "i-lucide-gift",
    previewTone: "light",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-aviro-04-benefits"] || '')]
  },
  {
    id: "postcards-aviro-05-cta",
    categoryId: "imported",
    kind: "section",
    name: "Aviro Perfect Bicycle CTA",
    description: "Image-led CTA for finding the right bicycle.",
    icon: "i-lucide-move-right",
    previewTone: "light",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-aviro-05-cta"] || '')]
  },
  {
    id: "postcards-aviro-06-categories",
    categoryId: "imported",
    kind: "section",
    name: "Aviro Categories",
    description: "Product category image links.",
    icon: "i-lucide-layout-grid",
    previewTone: "light",
    blocks: [importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-aviro-06-categories"] || '')]
  },
  {
    id: "postcards-aviro-07-footer",
    categoryId: "imported",
    kind: "section",
    name: "Aviro Footer",
    description: "Aviro footer with support and legal links.",
    icon: "i-lucide-panel-bottom",
    previewTone: "dark",
    blocks: [
      importedHtmlBlock(POSTCARDS_IMPORTED_HTML["postcards-aviro-07-footer"] || ''),
      importedLegalFooterBlock()
    ]
  }
]

export const IMPORTED_POSTCARDS_STARTER_TEMPLATES: EdmStarterTemplate[] = [
  {
    "id": "postcards-glidex",
    "name": "GlideX",
    "description": "Automotive upgrade campaign imported from the Postcards export.",
    "usage": "Promotion",
    "style": "Bold",
    "previewTone": "dark",
    "sectionPresetIds": [
      "postcards-glidex-01-brand",
      "postcards-glidex-02-hero",
      "postcards-glidex-03-offer",
      "postcards-glidex-04-connectivity",
      "postcards-glidex-05-safety",
      "postcards-glidex-06-cta",
      "postcards-glidex-07-footer"
    ],
    "subject": "Drive smarter, safer, and more efficiently",
    "previewText": "Limited-time upgrade offer from GlideX",
    "industry": "Automotive",
    "isNew": true
  },
  {
    "id": "postcards-futurax",
    "name": "FuturaX",
    "description": "EV reservation newsletter imported from the Postcards export.",
    "usage": "Newsletter",
    "style": "Bold",
    "previewTone": "dark",
    "sectionPresetIds": [
      "postcards-futurax-01-hero",
      "postcards-futurax-02-model",
      "postcards-futurax-03-design",
      "postcards-futurax-04-reserve",
      "postcards-futurax-05-footer"
    ],
    "subject": "Reserve your FuturaX",
    "previewText": "Receive FX Shop access with your reservation",
    "industry": "Automotive",
    "isNew": true
  },
  {
    "id": "postcards-aviro",
    "name": "Aviro",
    "description": "Bicycle ecommerce campaign imported from the Postcards export.",
    "usage": "Promotion",
    "style": "Retail",
    "previewTone": "dark",
    "sectionPresetIds": [
      "postcards-aviro-01-nav",
      "postcards-aviro-02-hero",
      "postcards-aviro-03-cart",
      "postcards-aviro-04-benefits",
      "postcards-aviro-05-cta",
      "postcards-aviro-06-categories",
      "postcards-aviro-07-footer"
    ],
    "subject": "Fresh bicycle models now in stock and ready",
    "previewText": "Explore newly released bicycle models from Aviro",
    "industry": "Sport",
    "isNew": true
  }
]
