// app/types/edm.ts
// Editor document model + state types, ported from the flyhub EDM layer
// (promotion-knoxgwmhaval/layers/edm/stores/edmBuilder.ts). Exact shapes kept
// so the ported store + components stay consistent.

export interface EdmMobileOverride {
  style?: Partial<NonNullable<EdmFlyhubBlock['data']['style']>> | null
  props?: Record<string, unknown> | null
}

// A single block within a flyhub document.
export interface EdmFlyhubBlock {
  type: string
  data: {
    style?: {
      color?: string | null
      backgroundColor?: string | null
      fontFamily?: string | null
      fontSize?: number | null
      fontWeight?: string | null
      textAlign?: 'left' | 'center' | 'right' | null
      padding?: {
        top: number
        bottom: number
        left: number
        right: number
      } | null
      // Phase 3a — rich per-element styling (all optional; absent ⇒ unchanged
      // render). Shared emission via app/utils/edmStyle.ts across both renderers.
      lineHeight?: number | string | null
      letterSpacing?: number | null
      textTransform?: string | null
      opacity?: number | null
      borderWidth?: number | null
      borderStyle?: string | null
      borderColor?: string | null
      borderRadius?: number | null
      boxShadow?: string | null
      backgroundImage?: string | null
    } | null
    props?: Record<string, unknown> | null
    mobile?: EdmMobileOverride | null
    hideOnMobile?: boolean | null
    hideOnDesktop?: boolean | null
    childrenIds?: string[]
  }
}

// The document is a flat map of block IDs to block definitions (with a `root`).
export type EdmFlyhubDocument = Record<string, EdmFlyhubBlock>

// Email layout settings derived from the root block.
export interface EdmEmailLayoutSettings {
  backdropColor: string
  canvasColor: string
  textColor: string
  fontFamily: string
  borderColor?: string
  borderRadius?: number
}

export type SidebarTab = 'styles' | 'block-configuration'
export type MainTab = 'editor' | 'preview' | 'json' | 'html'
export type ScreenSize = 'desktop' | 'mobile'

// Undo/redo snapshot — captures all mutable editor state.
export interface EditorSnapshot {
  document: EdmFlyhubDocument
  dynamicBlocks: EdmBlockBase[]
  dynamicBlockMapping: Record<string, string>
}

// Dynamic-block metadata. Loosely typed here to decouple from the source
// project's automotive block-type union (dynamic blocks are out of scope for
// the agency email module; this keeps the store compiling without that tree).
export interface EdmBlockBase {
  id: string
  type: string
  category?: string
  label: string
  icon?: string
  data: Record<string, unknown>
  position?: number
  [key: string]: unknown
}

// Default empty email document.
export function createEmptyDocument(): EdmFlyhubDocument {
  return {
    root: {
      type: 'EmailLayout',
      data: {
        props: {
          backdropColor: '#F5F5F5',
          canvasColor: '#FFFFFF',
          textColor: '#262626',
          fontFamily: 'MODERN_SANS'
        },
        childrenIds: []
      }
    }
  }
}

// Generate a unique block ID.
export function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
