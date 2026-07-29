import { createProviderAdapter } from './shared'
export const gumtreeAdapter = createProviderAdapter({ id: 'gumtree', priority: 50, sourceName: 'Gumtree', medium: 'classifieds', markers: /\bgumtree\b/i, senderDomains: ['gumtree.com.au', 'gumtree.example'] })
