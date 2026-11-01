import {
  EmailDesignError,
  validateEmailDesign,
  type EmailDesignBlock
} from './designContract'
import {
  assessDesignCapabilities,
  type CapabilityReport
} from './designCapabilities'

export interface RendererDesignSource {
  document: Record<string, EmailDesignBlock>
  capabilities: CapabilityReport
}

/** Adapt the canonical envelope to the existing private renderer's document.
 * This does not decode native FigFlow files, rasterise artwork, publish, resolve
 * recipient tokens or certify client compatibility. Use the same renderer
 * client as ordinary composer documents after this conversion. */
export function designToRendererDocument(input: unknown): RendererDesignSource {
  const design = validateEmailDesign(input)
  const capabilities = assessDesignCapabilities(design)
  if (capabilities.hasUnsupported || capabilities.hasPolicyConflicts)
    throw new EmailDesignError('INVALID_DESIGN', 'capabilities')
  const document = design.blocks // validation returned an independent snapshot
  if (design.kind === 'module') {
    if (Object.hasOwn(document, 'root'))
      throw new EmailDesignError('INVALID_DESIGN', 'blocks.root')
    document.root = {
      type: 'EmailLayout',
      data: { childrenIds: [...design.rootChildrenIds] }
    }
  }
  return { document, capabilities }
}
