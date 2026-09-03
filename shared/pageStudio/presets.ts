import type {
  PageStudioBlock,
  PageStudioBlockItem,
  PageStudioDocument,
  PageStudioPage,
  PageStudioShell
} from './document'

export type SectionPresetId
  = | 'editorial-hero'
    | 'conversion-hero'
    | 'split-image-story'
    | 'service-feature-grid'
    | 'proof-statistics'
    | 'customer-testimonials'
    | 'frequently-asked-questions'
    | 'contact-callout'
    | 'partner-logo-cloud'
    | 'article-grid'
    | 'closing-call-to-action'

export type PagePresetId = 'landing-page' | 'service-page' | 'contact-page' | 'campaign-page' | 'blog-index'
export type ShellPresetId = 'minimal-header' | 'standard-header' | 'campaign-header' | 'compact-footer' | 'multi-column-footer' | 'conversion-footer'
export type SitePresetId = 'professional-services' | 'local-business' | 'campaign-microsite'

export interface PageStudioPresetSummary<T extends string> {
  id: T
  name: string
  description: string
  icon: string
  version: 1
}

export interface PageStudioShellPresetSummary extends PageStudioPresetSummary<ShellPresetId> {
  target: 'header' | 'footer'
}

export interface PageStudioSitePresetSummary extends PageStudioPresetSummary<SitePresetId> {
  pageCount: number
}

const sectionSummaries: Array<PageStudioPresetSummary<SectionPresetId>> = [
  { id: 'editorial-hero', name: 'Editorial hero', description: 'A confident text-first introduction for considered brands.', icon: 'i-lucide-type', version: 1 },
  { id: 'conversion-hero', name: 'Conversion hero', description: 'A direct value proposition with one primary action.', icon: 'i-lucide-mouse-pointer-click', version: 1 },
  { id: 'split-image-story', name: 'Split image story', description: 'Pair a strong image with a focused business narrative.', icon: 'i-lucide-panels-left-bottom', version: 1 },
  { id: 'service-feature-grid', name: 'Service feature grid', description: 'Present three clear capabilities without visual clutter.', icon: 'i-lucide-layout-grid', version: 1 },
  { id: 'proof-statistics', name: 'Proof statistics', description: 'Turn measurable outcomes into a concise proof point.', icon: 'i-lucide-chart-no-axes-column-increasing', version: 1 },
  { id: 'customer-testimonials', name: 'Customer testimonials', description: 'Show credible customer outcomes and attribution.', icon: 'i-lucide-quote', version: 1 },
  { id: 'frequently-asked-questions', name: 'Frequently asked questions', description: 'Answer common objections in a scannable format.', icon: 'i-lucide-circle-help', version: 1 },
  { id: 'contact-callout', name: 'Contact callout', description: 'Provide clear contact paths and a strong next step.', icon: 'i-lucide-contact', version: 1 },
  { id: 'partner-logo-cloud', name: 'Partner logo cloud', description: 'Display trusted partners or customer organisations.', icon: 'i-lucide-badge-check', version: 1 },
  { id: 'article-grid', name: 'Article grid', description: 'Introduce recent insights with titles and summaries.', icon: 'i-lucide-newspaper', version: 1 },
  { id: 'closing-call-to-action', name: 'Closing call to action', description: 'Finish a page with one deliberate conversion path.', icon: 'i-lucide-arrow-right-circle', version: 1 }
]

export const PAGE_STUDIO_SECTION_PRESETS = sectionSummaries

export const PAGE_STUDIO_PAGE_PRESETS: Array<PageStudioPresetSummary<PagePresetId> & { sections: SectionPresetId[] }> = [
  { id: 'landing-page', name: 'Landing page', description: 'Conversion-led campaign page with proof and a closing action.', icon: 'i-lucide-rectangle-vertical', version: 1, sections: ['conversion-hero', 'service-feature-grid', 'proof-statistics', 'customer-testimonials', 'closing-call-to-action'] },
  { id: 'service-page', name: 'Service page', description: 'Explain an offer, supporting capabilities, proof and next steps.', icon: 'i-lucide-briefcase-business', version: 1, sections: ['editorial-hero', 'split-image-story', 'service-feature-grid', 'frequently-asked-questions', 'closing-call-to-action'] },
  { id: 'contact-page', name: 'Contact page', description: 'A concise invitation followed by practical contact details.', icon: 'i-lucide-mail', version: 1, sections: ['editorial-hero', 'contact-callout'] },
  { id: 'campaign-page', name: 'Campaign page', description: 'A focused promotion with proof, FAQs and one conversion action.', icon: 'i-lucide-megaphone', version: 1, sections: ['conversion-hero', 'proof-statistics', 'frequently-asked-questions', 'closing-call-to-action'] },
  { id: 'blog-index', name: 'Blog index', description: 'Editorial introduction and a structured article collection.', icon: 'i-lucide-library-big', version: 1, sections: ['editorial-hero', 'article-grid'] }
]

export const PAGE_STUDIO_SHELL_PRESETS: PageStudioShellPresetSummary[] = [
  { id: 'minimal-header', target: 'header', name: 'Minimal header', description: 'Brand, essential links and no competing action.', icon: 'i-lucide-minus', version: 1 },
  { id: 'standard-header', target: 'header', name: 'Standard navigation', description: 'Primary navigation with a clear contact action.', icon: 'i-lucide-navigation', version: 1 },
  { id: 'campaign-header', target: 'header', name: 'Campaign header', description: 'A compact campaign mark with one conversion action.', icon: 'i-lucide-goal', version: 1 },
  { id: 'compact-footer', target: 'footer', name: 'Compact footer', description: 'A restrained footer for short sites and campaigns.', icon: 'i-lucide-panel-bottom', version: 1 },
  { id: 'multi-column-footer', target: 'footer', name: 'Multi-column footer', description: 'Structured links for a complete business website.', icon: 'i-lucide-columns-3', version: 1 },
  { id: 'conversion-footer', target: 'footer', name: 'Conversion footer', description: 'A final action paired with essential legal links.', icon: 'i-lucide-move-right', version: 1 }
]

export const PAGE_STUDIO_SITE_PRESETS: PageStudioSitePresetSummary[] = [
  { id: 'professional-services', name: 'Professional services', description: 'Home, services, about and contact pages with an editorial voice.', icon: 'i-lucide-building-2', version: 1, pageCount: 4 },
  { id: 'local-business', name: 'Local business', description: 'A practical four-page site focused on trust and enquiries.', icon: 'i-lucide-store', version: 1, pageCount: 4 },
  { id: 'campaign-microsite', name: 'Campaign microsite', description: 'A focused campaign and thank-you journey in two pages.', icon: 'i-lucide-rocket', version: 1, pageCount: 2 }
]

function item(idFactory: () => string, value: Partial<Omit<PageStudioBlockItem, 'id'>>): PageStudioBlockItem {
  return {
    id: idFactory(), title: '', body: '', label: '', value: '', imageUrl: '', imageAlt: '', href: '', ...value
  }
}

function block(
  idFactory: () => string,
  type: PageStudioBlock['type'],
  value: Partial<Omit<PageStudioBlock, 'id' | 'type'>>
): PageStudioBlock {
  return {
    id: idFactory(), type, eyebrow: '', heading: '', body: '', buttonLabel: '', buttonHref: '', imageUrl: '', imageAlt: '', alignment: 'left', background: 'canvas', ...value
  }
}

export function instantiateSectionPreset(id: SectionPresetId, idFactory: () => string): PageStudioBlock {
  switch (id) {
    case 'editorial-hero':
      return block(idFactory, 'hero', { eyebrow: 'A better way forward', heading: 'Make the important choice feel clear.', body: 'Introduce the business with a focused promise, useful context and a confident next step.', buttonLabel: 'Explore our approach', buttonHref: '/about', background: 'canvas' })
    case 'conversion-hero':
      return block(idFactory, 'hero', { eyebrow: 'Built around your next move', heading: 'Turn attention into meaningful action.', body: 'State the offer, the audience and the outcome without making visitors search for the point.', buttonLabel: 'Start a conversation', buttonHref: '/contact', background: 'dark' })
    case 'split-image-story':
      return block(idFactory, 'image', { eyebrow: 'How we work', heading: 'Expertise made practical.', body: 'Use a real image and a concise explanation to show how the team solves the customer problem.', imageAlt: 'Team delivering the service', background: 'muted' })
    case 'service-feature-grid':
      return block(idFactory, 'features', { eyebrow: 'Capabilities', heading: 'Everything needed to move with confidence.', body: 'Group the offer into three clear, outcome-oriented services.', items: [
        item(idFactory, { label: '01', title: 'Strategy', body: 'Define priorities, evidence and a practical path forward.' }),
        item(idFactory, { label: '02', title: 'Delivery', body: 'Turn the plan into focused work with accountable ownership.' }),
        item(idFactory, { label: '03', title: 'Improvement', body: 'Measure what changed and strengthen the next decision.' })
      ] })
    case 'proof-statistics':
      return block(idFactory, 'stats', { eyebrow: 'Evidence', heading: 'Results that stand up to scrutiny.', alignment: 'center', background: 'dark', items: [
        item(idFactory, { value: '42%', label: 'Faster delivery', body: 'From approved direction to completed work.' }),
        item(idFactory, { value: '3.4x', label: 'Return on effort', body: 'More value from each operating cycle.' }),
        item(idFactory, { value: '96%', label: 'Client confidence', body: 'Stakeholders who would choose the team again.' })
      ] })
    case 'customer-testimonials':
      return block(idFactory, 'testimonials', { eyebrow: 'Client perspective', heading: 'Trusted when the work matters.', background: 'muted', items: [
        item(idFactory, { body: 'The process gave our team clarity without slowing down delivery.', title: 'Operations Director', label: 'Customer organisation' }),
        item(idFactory, { body: 'We could see the decisions, evidence and next actions in one place.', title: 'Marketing Lead', label: 'Growth business' })
      ] })
    case 'frequently-asked-questions':
      return block(idFactory, 'faq', { eyebrow: 'Common questions', heading: 'What to know before getting started.', items: [
        item(idFactory, { title: 'What does the first step involve?', body: 'We confirm the objective, constraints and evidence required before recommending a path.' }),
        item(idFactory, { title: 'How long does delivery take?', body: 'Timing depends on scope, but each stage has a clear owner, decision and completion signal.' }),
        item(idFactory, { title: 'How will progress be measured?', body: 'The agreed outcomes and supporting indicators are recorded before work begins.' })
      ] })
    case 'contact-callout':
      return block(idFactory, 'contact', { eyebrow: 'Contact', heading: 'Talk with a person who can help.', body: 'Choose the most useful way to begin. The team will respond with clear next steps.', buttonLabel: 'Send an enquiry', buttonHref: 'mailto:hello@example.com', background: 'brand', items: [
        item(idFactory, { label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }),
        item(idFactory, { label: 'Phone', value: '+61 3 9000 0000', href: 'tel:+61390000000' }),
        item(idFactory, { label: 'Hours', value: 'Monday to Friday, 9am-5pm' })
      ] })
    case 'partner-logo-cloud':
      return block(idFactory, 'logo-cloud', { eyebrow: 'Trusted by', heading: 'Working with ambitious organisations.', alignment: 'center', items: [
        item(idFactory, { title: 'North & Co', imageAlt: 'North and Co logo' }),
        item(idFactory, { title: 'Fieldwork', imageAlt: 'Fieldwork logo' }),
        item(idFactory, { title: 'Assembly', imageAlt: 'Assembly logo' }),
        item(idFactory, { title: 'Good Company', imageAlt: 'Good Company logo' })
      ] })
    case 'article-grid':
      return block(idFactory, 'blog-grid', { eyebrow: 'Latest thinking', heading: 'Useful ideas for the work ahead.', items: [
        item(idFactory, { label: 'Guide', title: 'How to make a complex decision easier', body: 'A practical framework for aligning evidence, people and timing.', href: '/insights/complex-decisions' }),
        item(idFactory, { label: 'Perspective', title: 'What strong delivery systems have in common', body: 'The operating habits that create confidence and momentum.', href: '/insights/delivery-systems' }),
        item(idFactory, { label: 'Case study', title: 'From fragmented work to one accountable plan', body: 'How a growing team created a clearer path to outcomes.', href: '/insights/accountable-plan' })
      ] })
    case 'closing-call-to-action':
      return block(idFactory, 'cta', { heading: 'Ready to make the next move clear?', body: 'Start with a focused conversation about the outcome you need.', buttonLabel: 'Contact the team', buttonHref: '/contact', alignment: 'center', background: 'brand' })
  }
}

export function instantiatePagePreset(id: PagePresetId, idFactory: () => string): PageStudioBlock[] {
  const preset = PAGE_STUDIO_PAGE_PRESETS.find(entry => entry.id === id)
  if (!preset) throw new Error(`Unknown Page Studio page preset: ${id}`)
  return preset.sections.map(sectionId => instantiateSectionPreset(sectionId, idFactory))
}

function defaultShell(): PageStudioShell {
  return {
    headerPresetId: 'standard', footerPresetId: 'multi-column', siteName: 'Your business', primaryActionLabel: 'Contact us', primaryActionHref: '/contact', navigation: [], footerGroups: [], copyright: 'Your business. All rights reserved.'
  }
}

export function applyShellPreset(document: PageStudioDocument, id: ShellPresetId, idFactory: () => string = () => crypto.randomUUID()): PageStudioDocument {
  const shell = structuredClone(document.shell || defaultShell())
  if (id === 'minimal-header') {
    shell.headerPresetId = 'minimal'
    shell.navigation = [{ id: idFactory(), label: 'About', href: '/about' }, { id: idFactory(), label: 'Contact', href: '/contact' }]
    shell.primaryActionLabel = ''
    shell.primaryActionHref = ''
  } else if (id === 'standard-header') {
    shell.headerPresetId = 'standard'
    shell.navigation = [{ id: idFactory(), label: 'Services', href: '/services' }, { id: idFactory(), label: 'About', href: '/about' }, { id: idFactory(), label: 'Contact', href: '/contact' }]
    shell.primaryActionLabel = 'Contact us'
    shell.primaryActionHref = '/contact'
  } else if (id === 'campaign-header') {
    shell.headerPresetId = 'campaign'
    shell.navigation = []
    shell.primaryActionLabel = 'Get the offer'
    shell.primaryActionHref = '#enquire'
  } else if (id === 'compact-footer') {
    shell.footerPresetId = 'compact'
    shell.footerGroups = []
  } else if (id === 'multi-column-footer') {
    shell.footerPresetId = 'multi-column'
    shell.footerGroups = [
      { id: idFactory(), title: 'Explore', links: [{ id: idFactory(), label: 'Services', href: '/services' }, { id: idFactory(), label: 'About', href: '/about' }] },
      { id: idFactory(), title: 'Connect', links: [{ id: idFactory(), label: 'Contact', href: '/contact' }, { id: idFactory(), label: 'LinkedIn', href: 'https://www.linkedin.com' }] }
    ]
  } else {
    shell.footerPresetId = 'conversion'
    shell.footerGroups = [{ id: idFactory(), title: 'Next step', links: [{ id: idFactory(), label: 'Start a conversation', href: '/contact' }] }]
  }
  return { ...document, shell }
}

function page(idFactory: () => string, title: string, slug: string, preset: PagePresetId): PageStudioPage {
  return {
    id: idFactory(), parentId: null, title, slug, visibility: 'visible', status: 'visible', headerMode: 'inherit', footerMode: 'inherit', seoTitle: title, seoDescription: `${title} from Your business.`, blocks: instantiatePagePreset(preset, idFactory)
  }
}

export function instantiateSitePreset(id: SitePresetId, idFactory: () => string): PageStudioDocument {
  const definitions: Record<SitePresetId, Array<[string, string, PagePresetId]>> = {
    'professional-services': [['Home', '', 'landing-page'], ['Services', 'services', 'service-page'], ['About', 'about', 'service-page'], ['Contact', 'contact', 'contact-page']],
    'local-business': [['Home', '', 'landing-page'], ['Services', 'services', 'service-page'], ['Our area', 'our-area', 'service-page'], ['Contact', 'contact', 'contact-page']],
    'campaign-microsite': [['Campaign', '', 'campaign-page'], ['Thank you', 'thank-you', 'contact-page']]
  }
  const pages = definitions[id].map(([title, slug, preset]) => page(idFactory, title, slug, preset))
  let document: PageStudioDocument = { schemaVersion: 1, pages, homepageId: pages[0]!.id, redirects: [] }
  document = applyShellPreset(document, id === 'campaign-microsite' ? 'campaign-header' : 'standard-header', idFactory)
  document = applyShellPreset(document, id === 'campaign-microsite' ? 'conversion-footer' : 'multi-column-footer', idFactory)
  return document
}
