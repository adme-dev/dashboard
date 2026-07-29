import { createProviderAdapter } from './shared'
export const carsguideAdapter = createProviderAdapter({ id: 'carsguide', priority: 30, sourceName: 'CarsGuide', medium: 'classifieds', markers: /\bcars\s*guide\b/i, senderDomains: ['carsguide.com.au', 'carsguide.example'] })
