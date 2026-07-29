import { createProviderAdapter } from './shared'
export const instagramAdapter = createProviderAdapter({ id: 'instagram', priority: 70, sourceName: 'Instagram', medium: 'paid-social', markers: /\binstagram\s+(?:lead|form)|\bnew instagram lead\b/i, senderDomains: ['instagram.com', 'instagram.example'] })
