import { createProviderAdapter } from './shared'
export const carsalesAdapter = createProviderAdapter({ id: 'carsales', priority: 10, sourceName: 'Carsales', medium: 'classifieds', markers: /\bcarsales\b/i, senderDomains: ['carsales.com.au', 'carsales.example'] })
