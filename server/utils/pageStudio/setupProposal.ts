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
  requiresAgencyReview: boolean
}

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
  return {
    businessName: input.businessName,
    setupSource: input.setupSource,
    starterVersion: input.starterVersion,
    modules,
    pages,
    collections,
    requiresAgencyReview: true
  }
}
