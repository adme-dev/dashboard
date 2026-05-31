// server/utils/email-marketing/render/blocks/index.ts
// Block registration barrel — importing this registers all generic block
// definitions with the registry. Generic blocks only (no automotive).
import './heading'
import './text'
import './button'
import './image'
import './divider'
import './spacer'
import './avatar'
import './html-block'
import './container'
import './columns-container'
import './email-layout'
import './social'
import './menu'
import './header-block'
import './footer-block'
import './hero-section'
import './feature-grid'
import './countdown-timer'
import './cta-banner'
import './testimonial'
import './review-stars'
import './next-steps'

// Sentinel re-export so renderers can `import { BLOCKS_LOADED } from './blocks'`
// — keeps the side-effect imports alive against Vite SSR tree-shaking.
export const BLOCKS_LOADED = true
