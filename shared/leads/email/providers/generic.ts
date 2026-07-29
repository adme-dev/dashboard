import { createProviderAdapter } from './shared'
export const genericAdapter = createProviderAdapter({ id: 'generic', priority: 100, sourceName: 'Generic lead email', medium: 'lead_ingest', markers: /(?:^|\n)\s*(?:name|email|phone|mobile)\s*[:\-]/i, senderDomains: [] })
