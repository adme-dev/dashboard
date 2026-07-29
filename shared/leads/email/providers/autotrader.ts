import { createProviderAdapter } from './shared'
export const autotraderAdapter = createProviderAdapter({ id: 'autotrader', priority: 20, sourceName: 'AutoTrader', medium: 'classifieds', markers: /\bauto\s*trader\b/i, senderDomains: ['autotrader.com.au', 'autotrader.example'] })
