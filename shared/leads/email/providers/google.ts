import { createProviderAdapter } from './shared'
export const googleAdapter = createProviderAdapter({ id: 'google', priority: 90, sourceName: 'Google', medium: 'cpc', markers: /\bgoogle\s+(?:ads?|lead|form)|\bnew google lead\b/i, senderDomains: ['google.com', 'google.example'] })
