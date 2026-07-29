import { createProviderAdapter } from './shared'
export const metaAdapter = createProviderAdapter({ id: 'meta', priority: 60, sourceName: 'Meta', medium: 'paid-social', markers: /\b(?:meta|facebook)\s+(?:lead|form)|\bnew facebook lead\b/i, senderDomains: ['facebookmail.com', 'meta.example', 'facebook.example'] })
