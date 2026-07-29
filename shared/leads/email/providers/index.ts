import { autotraderAdapter } from './autotrader'
import { carsguideAdapter } from './carsguide'
import { carsalesAdapter } from './carsales'
import { driveAdapter } from './drive'
import { googleAdapter } from './google'
import { gumtreeAdapter } from './gumtree'
import { instagramAdapter } from './instagram'
import { metaAdapter } from './meta'
import { tiktokAdapter } from './tiktok'

export { type EmailProviderAdapter, type ProviderMatch } from './types'
export { genericAdapter } from './generic'

/** The generic adapter is deliberately separate: it is the parser fallback, not provider evidence. */
export const allEmailProviderAdapters = Object.freeze([
  carsalesAdapter,
  autotraderAdapter,
  carsguideAdapter,
  driveAdapter,
  gumtreeAdapter,
  metaAdapter,
  instagramAdapter,
  tiktokAdapter,
  googleAdapter
])
