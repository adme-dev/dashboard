import { validateEmailDesign } from './designContract'

export type CapabilityDisposition
  = 'native-editable' | 'design-only' | 'raster-fallback' | 'unsupported'
export interface BlockCapability {
  blockId: string
  disposition: CapabilityDisposition
  editableFields: string[]
  reason: string
}
export interface CapabilityReport {
  version: 1
  tier: 'source-capabilities'
  blocks: BlockCapability[]
  hasUnsupported: boolean
  hasPolicyConflicts: boolean
  issues: Array<{
    code: 'POLICY_CAPABILITY_MISMATCH'
    blockId: string
    fields: string[]
  }>
}
const native = new Set([
  'EmailLayout',
  'Heading',
  'Text',
  'Button',
  'Image',
  'Avatar',
  'Divider',
  'Spacer',
  'Container',
  'ColumnsContainer'
])
// Existing renderer support is not evidence of reverse FigFlow editability.
const locked = new Set([
  'Html',
  'social',
  'menu',
  'header',
  'footer',
  'hero-section',
  'feature-grid',
  'countdown-timer',
  'cta-banner',
  'testimonial',
  'review-stars',
  'next-steps'
])

/** Conservative source assessment, never a preflight or send-ready certificate.
 * Rasterisation requires a later explicit, reviewed conversion; unknown input
 * cannot grant itself fallback status merely by setting a property. */
export function assessDesignCapabilities(input: unknown): CapabilityReport {
  const design = validateEmailDesign(input)
  const issues: CapabilityReport['issues'] = []
  const blocks = Object.entries(design.blocks).map(
    ([blockId, block]): BlockCapability => {
      const editableFields = design.policy.editableFields.filter(path =>
        path.startsWith(`${blockId}.`)
      )
      if (native.has(block.type))
        return {
          blockId,
          disposition: editableFields.length
            ? 'native-editable'
            : 'design-only',
          editableFields,
          reason:
            'Existing structured composer block; only persisted policy fields may be edited.'
        }
      if (editableFields.length)
        issues.push({
          code: 'POLICY_CAPABILITY_MISMATCH',
          blockId,
          fields: editableFields
        })
      if (locked.has(block.type))
        return {
          blockId,
          disposition: 'design-only',
          editableFields: [],
          reason:
            'Preserve the existing block; editable FigFlow conversion is not yet verified.'
        }
      return {
        blockId,
        disposition: 'unsupported',
        editableFields: [],
        reason:
          'No verified email conversion. Resolve this block before publication.'
      }
    }
  )
  return {
    version: 1,
    tier: 'source-capabilities',
    blocks,
    hasUnsupported: blocks.some(block => block.disposition === 'unsupported'),
    hasPolicyConflicts: issues.length > 0,
    issues
  }
}
