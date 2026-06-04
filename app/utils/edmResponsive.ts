import {
  extendedStyleDeclarations,
  safeCssColor,
  type EdmExtendedStyle
} from '~~/app/utils/edmStyle'

export type EdmDevice = 'desktop' | 'mobile'

export interface EdmMobileOverride {
  style?: unknown
  props?: Record<string, unknown> | null
}

type ResponsiveBlock = {
  type: string
  data: {
    props?: Record<string, unknown> | null
    style?: unknown
    mobile?: EdmMobileOverride | null
    hideOnMobile?: boolean | null
    hideOnDesktop?: boolean | null
    childrenIds?: string[]
  }
}

function hasKeys(value: unknown): boolean {
  return !!value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function cloneBlock<T extends ResponsiveBlock>(
  block: T,
  blockProps: Record<string, unknown> | null | undefined,
  style: unknown
): T {
  return {
    ...block,
    data: {
      ...block.data,
      props: blockProps ?? block.data.props,
      style: style ?? block.data.style
    }
  }
}

export function getBlockForDevice<T extends ResponsiveBlock>(block: T, device: EdmDevice): T {
  if (device === 'desktop') return block
  const mobile = block.data.mobile
  if (!mobile || (!hasKeys(mobile.props) && !hasKeys(mobile.style))) return block
  return cloneBlock(
    block,
    { ...(block.data.props || {}), ...(mobile.props || {}) },
    hasKeys(mobile.style)
      ? { ...toRecord(block.data.style), ...toRecord(mobile.style) }
      : block.data.style
  )
}

export function isHiddenOnDevice(block: ResponsiveBlock, device: EdmDevice): boolean {
  return device === 'mobile' ? !!block.data.hideOnMobile : !!block.data.hideOnDesktop
}

export function getHideClassForBlock(block: ResponsiveBlock): string | null {
  if (block.data.hideOnMobile && block.data.hideOnDesktop) return 'edm-hide-all'
  if (block.data.hideOnMobile) return 'edm-hide-mobile'
  if (block.data.hideOnDesktop) return 'edm-hide-desktop'
  return null
}

export function edmBlockHasResponsiveRules(block: ResponsiveBlock): boolean {
  return !!getHideClassForBlock(block) || hasKeys(block.data.mobile?.props) || hasKeys(block.data.mobile?.style)
}

export function edmResponsiveClassForBlock(blockId: string): string {
  return `edm-r-${blockId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function baseStyleDeclarations(style: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const color = safeCssColor(style.color as string | null | undefined)
  if (color) out.push(['color', color])
  const backgroundColor = safeCssColor(style.backgroundColor as string | null | undefined)
  if (backgroundColor) out.push(['background-color', backgroundColor])
  if (typeof style.fontSize === 'number' && Number.isFinite(style.fontSize)) out.push(['font-size', `${style.fontSize}px`])
  if (typeof style.fontWeight === 'string' && /^(normal|bold|[1-9]00)$/.test(style.fontWeight)) out.push(['font-weight', style.fontWeight])
  if (typeof style.textAlign === 'string' && ['left', 'center', 'right'].includes(style.textAlign)) out.push(['text-align', style.textAlign])
  const padding = style.padding as { top?: number, right?: number, bottom?: number, left?: number } | null | undefined
  if (padding) {
    out.push(['padding', `${padding.top ?? 0}px ${padding.right ?? 0}px ${padding.bottom ?? 0}px ${padding.left ?? 0}px`])
  }
  return out
}

export function mobileStyleDeclarationsForBlock(block: ResponsiveBlock): Array<[string, string]> {
  const mobileStyle = toRecord(block.data.mobile?.style)
  if (!hasKeys(mobileStyle)) return []
  return [
    ...baseStyleDeclarations(mobileStyle),
    ...extendedStyleDeclarations(mobileStyle as EdmExtendedStyle)
  ]
}
