import { createProviderAdapter } from './shared'
export const tiktokAdapter = createProviderAdapter({ id: 'tiktok', priority: 80, sourceName: 'TikTok', medium: 'paid-social', markers: /\btik\s*tok\s+(?:lead|form)|\bnew tiktok lead\b/i, senderDomains: ['tiktok.com', 'tiktok.example'] })
