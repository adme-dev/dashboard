const STARTER_MODULES: Record<string, string[]> = {
  'automotive-campaign-v1': ['business-content', 'enquiries'],
  'limousine-v1': ['business-content', 'bookings', 'enquiries'],
  'floristry-v1': ['business-content', 'catalogue', 'delivery', 'orders'],
  'retail-v1': ['business-content', 'catalogue', 'inventory', 'orders'],
  'it-goods-v1': ['business-content', 'catalogue', 'inventory', 'orders'],
  'import-export-v1': ['business-content', 'catalogue', 'enquiries']
}

const KEYWORD_MODULES: Array<[string, RegExp]> = [
  ['bookings', /book|booking|appointment|hire|reservation/i],
  ['catalogue', /product|catalog|catalogue|shop|sell/i],
  ['delivery', /deliver|shipping|dispatch|courier/i],
  ['inventory', /stock|inventory|warehouse/i],
  ['orders', /order|checkout|cart/i],
  ['enquiries', /enquir|inquiry|quote|contact|lead/i]
]

export interface PageStudioSetupProposalInput {
  businessName: string
  starterVersion: string
  setupSource: 'template' | 'chat'
  setupBrief?: string
}

export interface PageStudioSetupProposal {
  businessName: string
  setupSource: 'template' | 'chat'
  starterVersion: string
  modules: string[]
  pages: string[]
  collections: string[]
  missingFacts: string[]
  requiresAgencyReview: boolean
}

const FACT_REQUIREMENTS: Array<{ label: string, modules: string[] }> = [
  { label: 'business contact details', modules: ['business-content'] },
  { label: 'service area or delivery locations', modules: ['business-content'] },
  { label: 'booking hours, timezone and availability rules', modules: ['bookings'] },
  { label: 'approved rates and minimum hire rules', modules: ['bookings'] },
  { label: 'product names, prices and availability', modules: ['catalogue'] },
  { label: 'delivery zones, fees and lead times', modules: ['delivery'] },
  { label: 'payment and fulfilment provider', modules: ['orders'] },
  { label: 'inventory source and stock policy', modules: ['inventory'] },
  { label: 'enquiry notification recipient', modules: ['enquiries'] }
]

export function createPageStudioSetupProposal(input: PageStudioSetupProposalInput): PageStudioSetupProposal {
  const text = input.setupBrief ?? ''
  const modules = [...new Set([
    ...(STARTER_MODULES[input.starterVersion] ?? ['business-content']),
    ...KEYWORD_MODULES.filter(([, pattern]) => pattern.test(text)).map(([module]) => module)
  ])]
  const pages = ['home', 'about', 'contact']
  const collections = ['profile', 'services']
  if (modules.includes('bookings')) pages.push('bookings')
  if (modules.includes('catalogue')) {
    pages.push('catalogue')
    collections.push('products')
  }
  if (modules.includes('delivery')) pages.push('delivery')
  if (modules.includes('orders')) pages.push('orders')
  if (modules.includes('enquiries')) pages.push('enquiries')
  if (modules.includes('inventory')) collections.push('inventory')
  // Free-text mentions are not verified business facts. Keep launch review topics
  // until an explicit, structured fact-confirmation workflow exists.
  const missingFacts = FACT_REQUIREMENTS
    .filter(check => check.modules.some(module => modules.includes(module)))
    .map(check => check.label)
  return {
    businessName: input.businessName,
    setupSource: input.setupSource,
    starterVersion: input.starterVersion,
    modules,
    pages,
    collections,
    missingFacts,
    requiresAgencyReview: true
  }
}
