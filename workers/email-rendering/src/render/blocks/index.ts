// server/utils/email-marketing/render/blocks/index.ts
// Block registration barrel — importing this registers all generic block
// definitions with the registry. Generic blocks only (no automotive).
//
// These imports intentionally consume a real exported value from each block
// module. Nitro's dev bundle can remove plain side-effect imports; using the
// exported block type keeps the module evaluation and its `registerBlock` call.
import { HEADING_BLOCK_TYPE } from './heading'
import { TEXT_BLOCK_TYPE } from './text'
import { BUTTON_BLOCK_TYPE } from './button'
import { IMAGE_BLOCK_TYPE } from './image'
import { DIVIDER_BLOCK_TYPE } from './divider'
import { SPACER_BLOCK_TYPE } from './spacer'
import { AVATAR_BLOCK_TYPE } from './avatar'
import { HTML_BLOCK_TYPE } from './html-block'
import { CONTAINER_BLOCK_TYPE } from './container'
import { COLUMNS_CONTAINER_BLOCK_TYPE } from './columns-container'
import { EMAIL_LAYOUT_BLOCK_TYPE } from './email-layout'
import { SOCIAL_BLOCK_TYPE } from './social'
import { MENU_BLOCK_TYPE } from './menu'
import { HEADER_BLOCK_TYPE } from './header-block'
import { FOOTER_BLOCK_TYPE } from './footer-block'
import { HERO_SECTION_BLOCK_TYPE } from './hero-section'
import { FEATURE_GRID_BLOCK_TYPE } from './feature-grid'
import { COUNTDOWN_TIMER_BLOCK_TYPE } from './countdown-timer'
import { CTA_BANNER_BLOCK_TYPE } from './cta-banner'
import { TESTIMONIAL_BLOCK_TYPE } from './testimonial'
import { REVIEW_STARS_BLOCK_TYPE } from './review-stars'
import { NEXT_STEPS_BLOCK_TYPE } from './next-steps'

const REGISTERED_BLOCK_TYPES = [
  HEADING_BLOCK_TYPE,
  TEXT_BLOCK_TYPE,
  BUTTON_BLOCK_TYPE,
  IMAGE_BLOCK_TYPE,
  DIVIDER_BLOCK_TYPE,
  SPACER_BLOCK_TYPE,
  AVATAR_BLOCK_TYPE,
  HTML_BLOCK_TYPE,
  CONTAINER_BLOCK_TYPE,
  COLUMNS_CONTAINER_BLOCK_TYPE,
  EMAIL_LAYOUT_BLOCK_TYPE,
  SOCIAL_BLOCK_TYPE,
  MENU_BLOCK_TYPE,
  HEADER_BLOCK_TYPE,
  FOOTER_BLOCK_TYPE,
  HERO_SECTION_BLOCK_TYPE,
  FEATURE_GRID_BLOCK_TYPE,
  COUNTDOWN_TIMER_BLOCK_TYPE,
  CTA_BANNER_BLOCK_TYPE,
  TESTIMONIAL_BLOCK_TYPE,
  REVIEW_STARS_BLOCK_TYPE,
  NEXT_STEPS_BLOCK_TYPE
]

// Sentinel re-export so renderers can `import { BLOCKS_LOADED } from './blocks'`.
export const BLOCKS_LOADED = REGISTERED_BLOCK_TYPES.length > 0
