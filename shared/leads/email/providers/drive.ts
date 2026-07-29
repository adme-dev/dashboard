import { createProviderAdapter } from './shared'
export const driveAdapter = createProviderAdapter({ id: 'drive', priority: 40, sourceName: 'Drive', medium: 'classifieds', markers: /\bdrive(?:\.com\.au)?\b/i, senderDomains: ['drive.com.au', 'drive.example'] })
