# EDM Postcards Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/agency/email` into a Postcards-style EDM builder with section categories, curated starter templates, visual section insertion, and retained from-scratch basic blocks.

**Architecture:** Keep the existing Flyhub-style flat `EdmFlyhubDocument` as the only persisted format. Add local TypeScript preset factories that expand into normal blocks, then surface those presets in the current editor shell and template gallery. Existing campaign/template APIs and server rendering stay unchanged.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Nuxt UI v4, Vitest, existing email-marketing renderer, existing `useEdmBuilder` composable.

---

## File Structure

- Create `app/utils/edmPresets.ts`: local section categories, section preset factories, starter template factories, and document cloning helpers.
- Create `app/utils/edmSectionSettings.ts`: generic editable-field metadata for surfaced custom section block types.
- Create `test/utils/edmPresets.test.ts`: pure tests for preset document validity, ID uniqueness, starter lookup, and renderer compatibility.
- Create `test/utils/edmSectionSettings.test.ts`: pure tests for custom-section inspector metadata.
- Create `test/components/emailEdmBlockRenderer.test.ts`: SSR component tests for client-side previews of custom section blocks.
- Modify `app/composables/useEdmBuilder.ts`: add document insertion and starter-template actions.
- Modify `app/components/email/builder/EdmBlockRenderer.vue`: render editor previews for custom section block types.
- Modify `app/components/email/builder/BlockSettingsPanel.vue`: render metadata-driven controls for custom section block types.
- Modify `app/components/email/builder/EdmFlyhubBuilder.client.vue`: replace the simple left block palette with a Postcards-style category list and section thumbnail rail; load `?starter=...`.
- Modify `app/components/email/TemplatesPanel.vue`: add blank and starter template cards while preserving saved-template actions.

All commands below must run from:

```bash
cd /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/edm-postcards-builder
```

Use Node 24 in this non-interactive shell:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH
```

---

### Task 1: Add Preset Catalog And Starter Documents

**Files:**
- Create: `test/utils/edmPresets.test.ts`
- Create: `app/utils/edmPresets.ts`

- [ ] **Step 1: Write the failing preset tests**

Create `test/utils/edmPresets.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { isFlyhubFormat } from '~~/server/utils/email-marketing/render/flyhub-html-renderer'
import {
  EDM_SECTION_CATEGORIES,
  EDM_STARTER_TEMPLATES,
  buildSectionDocumentFragment,
  buildStarterTemplateDocument,
  findSectionPreset,
  findStarterTemplate
} from '~~/app/utils/edmPresets'

describe('edmPresets', () => {
  it('includes basic scratch blocks and Postcards-style section categories', () => {
    expect(EDM_SECTION_CATEGORIES.map(category => category.id)).toEqual([
      'basic',
      'header',
      'content',
      'feature',
      'call-to-action',
      'e-commerce',
      'transactional',
      'footer'
    ])
    expect(findSectionPreset('basic-heading')?.kind).toBe('block')
    expect(findSectionPreset('hero-dark-product')?.kind).toBe('section')
  })

  it('builds section fragments with unique ids and ordered root children', () => {
    const fragment = buildSectionDocumentFragment('header-logo-menu')
    expect(fragment.rootChildrenIds).toHaveLength(2)
    expect(new Set(fragment.rootChildrenIds).size).toBe(fragment.rootChildrenIds.length)
    expect(Object.keys(fragment.blocks).sort()).toEqual([...fragment.rootChildrenIds].sort())
    expect(fragment.blocks[fragment.rootChildrenIds[0]]?.type).toBe('header')
    expect(fragment.blocks[fragment.rootChildrenIds[1]]?.type).toBe('menu')
  })

  it('builds starter template documents in valid Flyhub format', () => {
    for (const starter of EDM_STARTER_TEMPLATES) {
      const document = buildStarterTemplateDocument(starter.id)
      expect(isFlyhubFormat(document)).toBe(true)
      expect(document.root.data.childrenIds?.length).toBeGreaterThan(2)
      expect(Object.keys(document)).toContain('root')
    }
  })

  it('renders the newsletter digest starter without unknown block fallback markup', () => {
    const document = buildStarterTemplateDocument('newsletter-digest')
    const html = renderTemplateDocument(document, {
      subjectLine: 'Weekly digest',
      previewText: 'Latest updates from the team'
    })
    expect(html).toContain('Weekly digest')
    expect(html).toContain('Latest updates from the team')
    expect(html).toContain('Read the update')
    expect(html).not.toContain('available in upcoming update')
  })

  it('returns null for missing starter and section ids', () => {
    expect(findSectionPreset('missing-section')).toBeNull()
    expect(findStarterTemplate('missing-starter')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/edmPresets.test.ts
```

Expected: FAIL with an import error for `app/utils/edmPresets`.

- [ ] **Step 3: Implement the preset catalog**

Create `app/utils/edmPresets.ts` with these exports and data shapes:

```ts
import { generateBlockId, createEmptyDocument } from '~~/app/types/edm'
import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'
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

export interface EdmPresetBlockTemplate {
  type: string
  data: EdmFlyhubBlock['data']
}

export interface EdmSectionPreset {
  id: string
  categoryId: EdmSectionCategoryId
  kind: 'block' | 'section'
  name: string
  description: string
  icon: string
  previewTone: 'light' | 'dark' | 'accent'
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
  usage: 'Newsletter' | 'Promotion' | 'Transactional'
  style: 'Editorial' | 'Retail' | 'Utility'
  previewTone: 'light' | 'dark' | 'accent'
  sectionPresetIds: string[]
  subject: string
  previewText: string
}

export interface EdmDocumentFragment {
  blocks: Record<string, EdmFlyhubBlock>
  rootChildrenIds: string[]
}

function block(type: string, data: EdmFlyhubBlock['data']): EdmPresetBlockTemplate {
  return { type, data }
}

function basicPreset(type: string, name: string, icon: string): EdmSectionPreset {
  return {
    id: `basic-${type.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`,
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
        style: { padding: { top: 24, right: 24, bottom: 8, left: 24 }, textAlign: 'center', backgroundColor: '#ffffff' },
        props: { logoUrl: '', tagline: 'Your brand', alignment: 'center', backgroundColor: '#ffffff' }
      }),
      block('menu', {
        style: { padding: { top: 8, right: 24, bottom: 20, left: 24 }, color: '#111827', backgroundColor: '#ffffff' },
        props: { separator: '•', items: [{ label: 'Work', url: '#' }, { label: 'Offers', url: '#' }, { label: 'Contact', url: '#' }] }
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
        style: { padding: { top: 28, right: 24, bottom: 28, left: 24 }, textAlign: 'center', backgroundColor: '#171717' },
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
      block('Heading', { style: { padding: { top: 28, right: 32, bottom: 8, left: 32 }, textAlign: 'center', fontSize: 28, color: '#111827' }, props: { level: 'h1', text: 'Weekly digest' } }),
      block('Text', { style: { padding: { top: 0, right: 40, bottom: 16, left: 40 }, textAlign: 'center', color: '#4b5563' }, props: { text: 'A concise update with the latest campaign, product, and client news.' } }),
      block('Button', { style: { padding: { top: 0, right: 24, bottom: 28, left: 24 }, textAlign: 'center' }, props: { text: 'Read the update', url: '#', buttonBackgroundColor: '#0ea5e9', buttonTextColor: '#ffffff' } })
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
        style: { padding: { top: 24, right: 32, bottom: 24, left: 32 }, backgroundColor: '#ffffff' },
        props: {
          contents: '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">Microsoft</td><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">Google</td><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">Canon</td></tr><tr><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">Sony</td><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">Reebok</td><td style="text-align:center;color:#9ca3af;font-weight:700;padding:8px;">BBC</td></tr></table>'
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
        style: { padding: { top: 28, right: 24, bottom: 28, left: 24 }, backgroundColor: '#ffffff' },
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
        style: { padding: { top: 32, right: 32, bottom: 32, left: 32 }, fontFamily: 'MODERN_SANS' },
        props: { heading: 'Ready to launch?', subheading: 'Coordinate campaigns and product launches in one workflow.', ctaText: 'Start now', ctaUrl: '#', backgroundColor: '#0f62fe', textColor: '#ffffff' }
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
        props: { imageUrl: '', heading: 'Limited-time offer', subheading: 'Get 20% off your next campaign package.', ctaText: 'Claim offer', ctaUrl: '#', overlayOpacity: 0.35, textColor: '#ffffff' }
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
        style: { padding: { top: 28, right: 32, bottom: 28, left: 32 }, backgroundColor: '#f8fafc' },
        props: { heading: 'Next steps', steps: ['Review the details', 'Confirm the schedule', 'Watch for the launch email'] }
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
        style: { padding: { top: 24, right: 32, bottom: 24, left: 32 }, backgroundColor: '#f5f5f5' },
        props: { showUnsubscribe: true, showAddress: false, additionalText: 'You are receiving this email because you subscribed to updates.', backgroundColor: '#f5f5f5' }
      })
    ]
  }
]

export const EDM_SECTION_CATEGORIES: EdmSectionCategory[] = [
  { id: 'basic', label: 'Basic Modules', icon: 'i-lucide-box', presets: BASIC_PRESETS },
  { id: 'header', label: 'Header', icon: 'i-lucide-panel-top', presets: HEADER_PRESETS },
  { id: 'content', label: 'Content', icon: 'i-lucide-layout-list', presets: CONTENT_PRESETS },
  { id: 'feature', label: 'Feature', icon: 'i-lucide-sparkles', presets: FEATURE_PRESETS },
  { id: 'call-to-action', label: 'Call to action', icon: 'i-lucide-megaphone', presets: CTA_PRESETS },
  { id: 'e-commerce', label: 'E-Commerce', icon: 'i-lucide-shopping-cart', presets: ECOMMERCE_PRESETS },
  { id: 'transactional', label: 'Transactional', icon: 'i-lucide-receipt-text', presets: TRANSACTIONAL_PRESETS },
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
    sectionPresetIds: ['header-logo-menu', 'content-editorial-intro', 'feature-icon-grid', 'cta-blue-banner', 'footer-legal'],
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
    sectionPresetIds: ['header-dark-brand', 'hero-dark-product', 'feature-icon-grid', 'cta-blue-banner', 'footer-legal'],
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
    blocks[id] = JSON.parse(JSON.stringify(template))
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/edmPresets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add app/utils/edmPresets.ts test/utils/edmPresets.test.ts
git commit -m "feat(email): add edm section presets"
```

---

### Task 2: Add Store Actions For Preset Insertion

**Files:**
- Create: `test/utils/useEdmBuilderPresets.test.ts`
- Modify: `app/composables/useEdmBuilder.ts`

- [ ] **Step 1: Write the failing store tests**

Create `test/utils/useEdmBuilderPresets.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useEdmBuilder } from '~~/app/composables/useEdmBuilder'
import { buildStarterTemplateDocument } from '~~/app/utils/edmPresets'

describe('useEdmBuilder preset actions', () => {
  beforeEach(() => {
    useEdmBuilder().resetDocument()
  })

  it('inserts a section preset into the root document', () => {
    const store = useEdmBuilder()
    store.insertSectionPreset('header-logo-menu')
    const childIds = store.document.value.root.data.childrenIds || []
    expect(childIds).toHaveLength(2)
    expect(store.document.value[childIds[0]]?.type).toBe('header')
    expect(store.document.value[childIds[1]]?.type).toBe('menu')
  })

  it('inserts a section preset at a requested position', () => {
    const store = useEdmBuilder()
    const firstId = store.addBlock('Heading')
    store.insertSectionPreset('footer-legal', 0)
    const childIds = store.document.value.root.data.childrenIds || []
    expect(store.document.value[childIds[0]]?.type).toBe('footer')
    expect(childIds[1]).toBe(firstId)
  })

  it('loads a starter template document and resets history', () => {
    const store = useEdmBuilder()
    store.addBlock('Heading')
    expect(store.canUndo.value).toBe(true)
    store.setTemplatePreset('newsletter-digest')
    expect(store.document.value.root.data.childrenIds?.length).toBe(
      buildStarterTemplateDocument('newsletter-digest').root.data.childrenIds?.length
    )
    expect(store.canUndo.value).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/useEdmBuilderPresets.test.ts
```

Expected: FAIL with missing `insertSectionPreset` and `setTemplatePreset` functions.

- [ ] **Step 3: Add store actions**

Modify `app/composables/useEdmBuilder.ts`.

Add this import:

```ts
import {
  buildSectionDocumentFragment,
  buildStarterTemplateDocument
} from '~~/app/utils/edmPresets'
```

Add these functions in the Block CRUD section after `addBlock`:

```ts
  function insertBlocks(
    blocks: Record<string, EdmFlyhubBlock>,
    blockIds: string[],
    parentId: string = 'root',
    position?: number
  ) {
    recordHistory()
    const parent = document.value[parentId]
    if (!parent) return

    const childrenIds = [...(parent.data.childrenIds || [])]
    const insertAt = position === undefined
      ? childrenIds.length
      : Math.max(0, Math.min(position, childrenIds.length))

    childrenIds.splice(insertAt, 0, ...blockIds)

    document.value = {
      ...document.value,
      ...blocks,
      [parentId]: {
        ...parent,
        data: {
          ...parent.data,
          childrenIds
        }
      }
    }
  }

  function insertSectionPreset(sectionPresetId: string, position?: number) {
    const fragment = buildSectionDocumentFragment(sectionPresetId)
    insertBlocks(fragment.blocks, fragment.rootChildrenIds, 'root', position)
  }

  function setTemplatePreset(starterTemplateId: string) {
    resetDocument(buildStarterTemplateDocument(starterTemplateId))
  }
```

Expose them in the returned object:

```ts
    insertBlocks,
    insertSectionPreset,
    setTemplatePreset,
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/useEdmBuilderPresets.test.ts test/utils/edmPresets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add app/composables/useEdmBuilder.ts test/utils/useEdmBuilderPresets.test.ts
git commit -m "feat(email): insert edm section presets"
```

---

### Task 3: Add Client Preview Rendering For Custom Section Blocks

**Files:**
- Create: `test/components/emailEdmBlockRenderer.test.ts`
- Modify: `app/components/email/builder/EdmBlockRenderer.vue`

- [ ] **Step 1: Write the failing component preview tests**

Create `test/components/emailEdmBlockRenderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmBlockRenderer from '~~/app/components/email/builder/EdmBlockRenderer.vue'

async function renderBlock(type: string, blockProps: Record<string, unknown>, style: Record<string, unknown> = {}) {
  const app = createSSRApp({
    render: () => h(EdmBlockRenderer, { type, props: blockProps, style })
  })
  return renderToString(app)
}

describe('EmailBuilderEdmBlockRenderer custom sections', () => {
  it('renders hero-section preview content', async () => {
    const html = await renderBlock('hero-section', {
      heading: 'Simple post for Smart blog',
      subheading: 'Coordinate campaigns and launches.',
      ctaText: 'Download manual'
    })
    expect(html).toContain('Simple post for Smart blog')
    expect(html).toContain('Coordinate campaigns and launches.')
    expect(html).toContain('Download manual')
    expect(html).not.toContain('Unknown block')
  })

  it('renders feature-grid preview items', async () => {
    const html = await renderBlock('feature-grid', {
      features: [
        { icon: '•', heading: 'Plan', description: 'Map the launch.' },
        { icon: '•', heading: 'Build', description: 'Create assets.' }
      ]
    })
    expect(html).toContain('Plan')
    expect(html).toContain('Map the launch.')
    expect(html).toContain('Build')
    expect(html).not.toContain('Unknown block')
  })

  it('renders header, menu, cta-banner, and footer previews', async () => {
    expect(await renderBlock('header', { tagline: 'Your brand' })).toContain('Your brand')
    expect(await renderBlock('menu', { items: [{ label: 'Work', url: '#' }] })).toContain('Work')
    expect(await renderBlock('cta-banner', { heading: 'Ready?', ctaText: 'Start now' })).toContain('Ready?')
    expect(await renderBlock('footer', { additionalText: 'You subscribed to updates.' })).toContain('You subscribed to updates.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/components/emailEdmBlockRenderer.test.ts
```

Expected: FAIL because custom section types currently render the unknown-block fallback.

- [ ] **Step 3: Add preview branches**

Modify `app/components/email/builder/EdmBlockRenderer.vue`.

Add template branches before the unknown block:

```vue
  <div v-else-if="type === 'header'" :style="sectionStyle('#ffffff')" class="text-center">
    <img
      v-if="blockProps.logoUrl"
      :src="blockProps.logoUrl as string"
      alt="Logo"
      style="max-height:48px;width:auto;display:inline-block;margin-bottom:8px;"
    >
    <div style="font-weight:700;font-size:16px;">
      {{ blockProps.tagline || 'Your brand' }}
    </div>
  </div>

  <div v-else-if="type === 'menu'" :style="sectionStyle('#ffffff')" class="text-center">
    <a
      v-for="(item, index) in menuItems"
      :key="`${item.label}-${index}`"
      :href="item.url || '#'"
      style="display:inline-block;margin:0 8px;color:inherit;text-decoration:none;font-size:13px;font-weight:600;"
    >
      {{ item.label }}
    </a>
  </div>

  <div v-else-if="type === 'hero-section'" :style="heroPreviewStyle">
    <h1 style="margin:0;font-size:28px;line-height:1.15;font-weight:800;">
      {{ blockProps.heading || 'Campaign headline' }}
    </h1>
    <p v-if="blockProps.subheading" style="margin:10px 0 0;font-size:15px;line-height:1.5;">
      {{ blockProps.subheading }}
    </p>
    <span v-if="blockProps.ctaText" style="display:inline-block;margin-top:18px;padding:10px 16px;border-radius:6px;background:#0ea5e9;color:white;font-size:13px;font-weight:700;">
      {{ blockProps.ctaText }}
    </span>
  </div>

  <div v-else-if="type === 'feature-grid'" :style="sectionStyle('#ffffff')">
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;text-align:center;">
      <div v-for="(feature, index) in featureItems" :key="`${feature.heading}-${index}`">
        <div style="font-size:24px;color:#0ea5e9;">{{ feature.icon || '•' }}</div>
        <div style="font-weight:800;font-size:14px;margin-top:4px;">{{ feature.heading }}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:3px;line-height:1.35;">{{ feature.description }}</div>
      </div>
    </div>
  </div>

  <div v-else-if="type === 'cta-banner'" :style="ctaPreviewStyle">
    <h2 style="margin:0;font-size:22px;font-weight:800;">{{ blockProps.heading || 'Ready to launch?' }}</h2>
    <p v-if="blockProps.subheading" style="margin:8px 0 0;font-size:14px;line-height:1.45;">{{ blockProps.subheading }}</p>
    <span style="display:inline-block;margin-top:16px;padding:10px 16px;border-radius:6px;background:white;color:#0f62fe;font-size:13px;font-weight:800;">
      {{ blockProps.ctaText || 'Learn more' }}
    </span>
  </div>

  <div v-else-if="type === 'footer'" :style="sectionStyle('#f5f5f5')" class="text-center">
    <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">
      {{ blockProps.additionalText || 'You are receiving this email because you subscribed to updates.' }}
    </p>
    <p v-if="blockProps.showUnsubscribe !== false" style="margin:8px 0 0;font-size:12px;color:#6b7280;text-decoration:underline;">
      Unsubscribe
    </p>
  </div>
```

Add these computed helpers in the script:

```ts
const menuItems = computed(() => {
  return ((blockProps.value.items as Array<{ label: string, url: string }> | undefined) || [])
    .filter(item => item.label)
})

const featureItems = computed(() => {
  return ((blockProps.value.features as Array<{ icon?: string, heading: string, description: string }> | undefined) || [])
    .filter(item => item.heading || item.description)
})

function sectionStyle(defaultBackground: string) {
  return {
    ...buildBaseStyle(props.style),
    backgroundColor: (props.style?.backgroundColor as string) || defaultBackground,
    padding: getPadding(props.style?.padding) || '24px',
    color: (props.style?.color as string) || '#111827'
  }
}

const heroPreviewStyle = computed(() => ({
  ...sectionStyle('#171717'),
  textAlign: 'center',
  color: (blockProps.value.textColor as string) || '#ffffff',
  backgroundColor: '#171717',
  backgroundImage: blockProps.value.imageUrl
    ? `linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.42)), url("${blockProps.value.imageUrl}")`
    : undefined,
  backgroundSize: 'cover',
  backgroundPosition: 'center'
}))

const ctaPreviewStyle = computed(() => ({
  ...sectionStyle((blockProps.value.backgroundColor as string) || '#0f62fe'),
  textAlign: 'center',
  color: (blockProps.value.textColor as string) || '#ffffff',
  backgroundColor: (blockProps.value.backgroundColor as string) || '#0f62fe'
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/components/emailEdmBlockRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add app/components/email/builder/EdmBlockRenderer.vue test/components/emailEdmBlockRenderer.test.ts
git commit -m "feat(email): preview edm section blocks"
```

---

### Task 4: Add Metadata-Driven Inspector Controls For Custom Sections

**Files:**
- Create: `test/utils/edmSectionSettings.test.ts`
- Create: `app/utils/edmSectionSettings.ts`
- Modify: `app/components/email/builder/BlockSettingsPanel.vue`

- [ ] **Step 1: Write the failing metadata tests**

Create `test/utils/edmSectionSettings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getEdmSectionSettings } from '~~/app/utils/edmSectionSettings'

describe('edmSectionSettings', () => {
  it('defines editable controls for hero-section', () => {
    const settings = getEdmSectionSettings('hero-section')
    expect(settings?.title).toBe('Hero section')
    expect(settings?.fields.map(field => field.key)).toEqual([
      'imageUrl',
      'heading',
      'subheading',
      'ctaText',
      'ctaUrl',
      'overlayOpacity',
      'textColor'
    ])
  })

  it('defines editable repeater controls for menu and feature-grid', () => {
    expect(getEdmSectionSettings('menu')?.fields.find(field => field.key === 'items')?.type).toBe('menu-items')
    expect(getEdmSectionSettings('feature-grid')?.fields.find(field => field.key === 'features')?.type).toBe('feature-items')
  })

  it('returns null for primitive blocks', () => {
    expect(getEdmSectionSettings('Heading')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/edmSectionSettings.test.ts
```

Expected: FAIL with an import error for `app/utils/edmSectionSettings`.

- [ ] **Step 3: Implement settings metadata**

Create `app/utils/edmSectionSettings.ts`:

```ts
export type EdmSectionSettingFieldType =
  | 'text'
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
```

- [ ] **Step 4: Wire metadata into the inspector**

Modify `app/components/email/builder/BlockSettingsPanel.vue`.

Add import:

```ts
import { getEdmSectionSettings } from '~~/app/utils/edmSectionSettings'
```

Add script helpers:

```ts
const sectionSettings = computed(() => getEdmSectionSettings(props.block.type))

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
```

Add a template branch before the final shared Padding section and before primitive fallback branches end:

```vue
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
              <UInput :model-value="item.label" placeholder="Label" @update:model-value="updateMenuItem(index, 'label', String($event))" />
              <UInput :model-value="item.url" placeholder="URL" @update:model-value="updateMenuItem(index, 'url', String($event))" />
            </div>
            <UButton icon="i-lucide-plus" variant="outline" color="neutral" size="xs" label="Add item" @click="addMenuItem()" />
          </div>
        </UFormField>

        <UFormField v-else-if="field.type === 'feature-items'" :label="field.label">
          <div class="space-y-3">
            <div
              v-for="(item, index) in propArray<{ icon?: string, heading: string, description: string }>('features', [])"
              :key="index"
              class="space-y-2 rounded border border-default p-2"
            >
              <UInput :model-value="item.icon || ''" placeholder="Icon" @update:model-value="updateFeatureItem(index, 'icon', String($event))" />
              <UInput :model-value="item.heading" placeholder="Heading" @update:model-value="updateFeatureItem(index, 'heading', String($event))" />
              <UTextarea :model-value="item.description" :rows="2" placeholder="Description" @update:model-value="updateFeatureItem(index, 'description', String($event))" />
            </div>
            <UButton icon="i-lucide-plus" variant="outline" color="neutral" size="xs" label="Add feature" @click="addFeatureItem()" />
          </div>
        </UFormField>
      </template>
    </template>
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/edmSectionSettings.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add app/utils/edmSectionSettings.ts app/components/email/builder/BlockSettingsPanel.vue test/utils/edmSectionSettings.test.ts
git commit -m "feat(email): add section inspector metadata"
```

---

### Task 5: Rework Composer Into Postcards-Style Builder Shell

**Files:**
- Modify: `app/components/email/builder/EdmFlyhubBuilder.client.vue`

- [ ] **Step 1: Write a failing smoke test through existing preset/store tests**

Extend `test/utils/useEdmBuilderPresets.test.ts` with a behavior that the shell will rely on:

```ts
  it('keeps Basic block insertion available after section insertion', () => {
    const store = useEdmBuilder()
    store.insertSectionPreset('hero-dark-product')
    const headingId = store.addBlock('Heading')
    const childIds = store.document.value.root.data.childrenIds || []
    expect(childIds).toContain(headingId)
    expect(store.document.value[headingId]?.type).toBe('Heading')
  })
```

- [ ] **Step 2: Run tests to verify behavior**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/useEdmBuilderPresets.test.ts
```

Expected: PASS if Task 2 was implemented correctly. This is a guard before UI work; if it fails, fix Task 2 before changing UI.

- [ ] **Step 3: Add category state and starter loading**

Modify the script in `app/components/email/builder/EdmFlyhubBuilder.client.vue`.

Replace the import:

```ts
import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'
```

with:

```ts
import { getDefaultBlockData } from '~~/app/utils/edmBlocks'
import { EDM_SECTION_CATEGORIES, findStarterTemplate } from '~~/app/utils/edmPresets'
```

Add state near `layout`:

```ts
const selectedCategoryId = ref(EDM_SECTION_CATEGORIES[0]?.id || 'basic')
const selectedCategory = computed(() => {
  return EDM_SECTION_CATEGORIES.find(category => category.id === selectedCategoryId.value) || EDM_SECTION_CATEGORIES[0]
})
```

Add insertion function:

```ts
function addPreset(presetId: string, position?: number) {
  const preset = selectedCategory.value?.presets.find(item => item.id === presetId)
  if (!preset) return
  if (preset.kind === 'block') {
    const block = preset.blocks[0]
    if (!block) return
    store.addBlock(block.type, 'root', position, block.data)
    return
  }
  store.insertSectionPreset(preset.id, position)
}
```

In `onMounted`, before template `id` loading, add starter loading:

```ts
  const starter = route.query.starter
  if (typeof starter === 'string' && starter) {
    const starterTemplate = findStarterTemplate(starter)
    if (starterTemplate) {
      store.setTemplatePreset(starterTemplate.id)
      name.value = starterTemplate.name
      subject.value = starterTemplate.subject
      previewText.value = starterTemplate.previewText
    }
    return
  }
```

- [ ] **Step 4: Replace the simple left palette markup**

In the editor body, replace the current left `<aside class="w-56 ...">` block with:

```vue
        <aside class="w-[340px] border-r border-default bg-elevated/30 flex overflow-hidden">
          <div class="w-36 border-r border-default bg-default p-2 overflow-auto">
            <p class="px-2 py-2 text-[11px] font-semibold uppercase text-muted">
              Modules
            </p>
            <button
              v-for="category in EDM_SECTION_CATEGORIES"
              :key="category.id"
              type="button"
              class="w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors"
              :class="selectedCategoryId === category.id ? 'bg-elevated text-default font-semibold' : 'text-muted hover:text-default hover:bg-elevated/60'"
              @click="selectedCategoryId = category.id"
            >
              <UIcon :name="category.icon" class="h-4 w-4 shrink-0" />
              <span class="truncate">{{ category.label }}</span>
            </button>
          </div>

          <div class="flex-1 overflow-auto p-3">
            <p class="text-[11px] font-semibold uppercase text-muted mb-3">
              {{ selectedCategory?.label }}
            </p>
            <div class="space-y-3">
              <button
                v-for="preset in selectedCategory?.presets"
                :key="preset.id"
                type="button"
                class="w-full overflow-hidden rounded-md border border-default bg-default text-left transition hover:border-primary hover:shadow-sm"
                @click="addPreset(preset.id)"
              >
                <div
                  class="h-28 p-3"
                  :class="{
                    'bg-[#171717] text-white': preset.previewTone === 'dark',
                    'bg-primary/10 text-default': preset.previewTone === 'accent',
                    'bg-white dark:bg-elevated text-default': preset.previewTone === 'light'
                  }"
                >
                  <div class="flex items-center justify-center h-full rounded border border-dashed border-current/20">
                    <UIcon :name="preset.icon" class="h-6 w-6 opacity-70" />
                  </div>
                </div>
                <div class="p-3">
                  <p class="text-sm font-semibold">{{ preset.name }}</p>
                  <p class="mt-1 text-xs text-muted leading-snug">{{ preset.description }}</p>
                </div>
              </button>
            </div>
          </div>
        </aside>
```

- [ ] **Step 5: Update empty state and insert popover**

Change the canvas empty state copy to:

```vue
              <p class="font-medium text-default">
                Start with a section or Basic block
              </p>
              <p class="mt-1 text-sm text-muted">
                Choose a module from the left panel to build your email.
              </p>
```

In the add-at-end popover, replace `BLOCK_PALETTE` usage with:

```vue
                      v-for="preset in selectedCategory?.presets"
                      :key="preset.id"
                      @click="addPreset(preset.id)"
```

Use `preset.icon` and `preset.name` inside the button.

- [ ] **Step 6: Run relevant tests**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/useEdmBuilderPresets.test.ts test/utils/edmPresets.test.ts test/components/emailEdmBlockRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add app/components/email/builder/EdmFlyhubBuilder.client.vue test/utils/useEdmBuilderPresets.test.ts
git commit -m "feat(email): add postcards editor shell"
```

---

### Task 6: Rework Templates Panel Into Visual Gallery

**Files:**
- Modify: `app/components/email/TemplatesPanel.vue`

- [ ] **Step 1: Add starter imports and helpers**

Modify `app/components/email/TemplatesPanel.vue`.

Add import:

```ts
import { EDM_STARTER_TEMPLATES } from '~~/app/utils/edmPresets'
```

Add helper:

```ts
function openStarter(starterId: string) {
  navigateTo(`/agency/email/compose?starter=${starterId}`)
}
```

- [ ] **Step 2: Replace the list-first layout with cards**

Replace the top body with:

```vue
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <p class="text-sm font-medium">Templates</p>
        <p class="text-sm text-muted">
          Start blank, use a starter layout, or reopen a saved template.
        </p>
      </div>
      <UButton icon="i-lucide-plus" label="Blank template" @click="openComposer()" />
    </div>

    <section>
      <div class="mb-3 flex items-center justify-between">
        <p class="text-xs font-semibold uppercase text-muted">Starter templates</p>
        <div class="flex gap-2">
          <UBadge variant="subtle" color="neutral" label="Newsletter" />
          <UBadge variant="subtle" color="neutral" label="Promotion" />
          <UBadge variant="subtle" color="neutral" label="Transactional" />
        </div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          class="min-h-80 rounded-lg border border-dashed border-default bg-elevated/40 p-4 text-center hover:border-primary hover:bg-primary/5"
          @click="openComposer()"
        >
          <div class="flex h-52 items-center justify-center rounded-md bg-default">
            <UIcon name="i-lucide-plus" class="h-8 w-8 text-muted" />
          </div>
          <p class="mt-4 font-semibold">Create blank template</p>
          <p class="mt-1 text-sm text-muted">Start from Basic blocks and build manually.</p>
        </button>

        <button
          v-for="starter in EDM_STARTER_TEMPLATES"
          :key="starter.id"
          type="button"
          class="overflow-hidden rounded-lg border border-default bg-default text-left hover:border-primary hover:shadow-sm"
          @click="openStarter(starter.id)"
        >
          <div
            class="h-52 p-4"
            :class="{
              'bg-[#171717] text-white': starter.previewTone === 'dark',
              'bg-primary/10 text-default': starter.previewTone === 'accent',
              'bg-white dark:bg-elevated text-default': starter.previewTone === 'light'
            }"
          >
            <div class="flex h-full flex-col justify-between rounded border border-current/15 p-4">
              <p class="text-xs font-semibold uppercase opacity-70">{{ starter.usage }}</p>
              <p class="text-2xl font-bold leading-tight">{{ starter.name }}</p>
              <p class="text-xs opacity-70">{{ starter.style }}</p>
            </div>
          </div>
          <div class="p-4">
            <div class="flex items-center gap-2">
              <UBadge color="success" size="xs" label="New" />
              <p class="font-semibold">{{ starter.name }}</p>
            </div>
            <p class="mt-2 text-sm text-muted leading-snug">{{ starter.description }}</p>
          </div>
        </button>
      </div>
    </section>
```

Keep the existing pending, saved-template rows/actions, rename modal, and delete modal below this section. Convert saved templates from a bordered list to a grid if time allows, but do not remove duplicate/rename/delete behavior.

- [ ] **Step 3: Run preset tests**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/edmPresets.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add app/components/email/TemplatesPanel.vue
git commit -m "feat(email): add visual edm template gallery"
```

---

### Task 7: Final Verification And Local Browser Check

**Files:**
- Verify all modified files from Tasks 1-6.

- [ ] **Step 1: Run email and new feature tests**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm test:run test/utils/emailRenderDocument.test.ts test/utils/emailRenderHeading.test.ts test/utils/emailRenderMerge.test.ts test/utils/emailMarketingEmail.test.ts test/utils/emailCampaignFormat.test.ts test/utils/edmPresets.test.ts test/utils/useEdmBuilderPresets.test.ts test/utils/edmSectionSettings.test.ts test/components/emailEdmBlockRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Nuxt typecheck**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm run typecheck
```

Expected: Existing repo type issues may appear. If failures are unrelated to changed files, record them. If failures point at changed files, fix them before continuing.

- [ ] **Step 3: Run the dev server**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.14.0/bin:$PATH pnpm dev
```

Expected: Nuxt dev server starts and prints a local URL.

- [ ] **Step 4: Browser-check the feature**

Open the local app at the URL from Step 3 and inspect:

- `/agency/email` shows starter template cards and a blank template card.
- Starter template opens `/agency/email/compose?starter=<id>`.
- Composer shows category list, section thumbnails, canvas, and inspector.
- Basic blocks still insert from the Basic Modules category.
- A custom section inserts and renders in editor preview.
- Preview mode renders server HTML without unknown-block fallback markup.
- Save modal still opens.

- [ ] **Step 5: Stop the dev server**

Stop the `pnpm dev` session cleanly with Ctrl-C.

- [ ] **Step 6: Review changed files**

Run:

```bash
git diff --stat
git diff -- app/utils/edmPresets.ts app/utils/edmSectionSettings.ts app/composables/useEdmBuilder.ts app/components/email/builder/EdmBlockRenderer.vue app/components/email/builder/BlockSettingsPanel.vue app/components/email/builder/EdmFlyhubBuilder.client.vue app/components/email/TemplatesPanel.vue
```

Expected: changes are limited to the EDM builder, preset utilities, and tests.

- [ ] **Step 7: Commit any final fixes**

If Step 6 required polish fixes, commit them:

```bash
git add app test
git commit -m "fix(email): polish postcards builder"
```

If no fixes were needed, do not create an empty commit.

---

## Completion Criteria

- The feature branch contains the committed design spec and implementation commits.
- The editor supports both section presets and Basic scratch-building.
- Starter templates load through query params without new persistence APIs.
- Existing email render tests and new preset/component tests pass.
- Browser verification confirms the page is usable at desktop dimensions.
