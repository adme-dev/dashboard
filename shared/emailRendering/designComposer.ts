/* eslint no-control-regex: off -- Explicit control-byte rejection is required at this untrusted content boundary. */
import { snapshotRenderInput, RenderBoundaryError } from './bounds'
import {
  assertStaffDesignEdit,
  defaultDesignPolicy,
  DESIGN_LIMITS,
  EmailDesignError,
  validateEmailDesign,
  type EmailDesignDocument
} from './designContract'
import { designToRendererDocument } from './designAdapter'

/** Explicit first conversion of a persisted composer draft. The server, not the
 * browser, supplies its owning scope. Never apply this to an existing design:
 * that would replace its persisted policy, lineage and immutable module pins. */
export function composerToDesignDraft(source: unknown, clientId: string | null): EmailDesignDocument {
  let blocks: EmailDesignDocument['blocks']
  try {
    blocks = snapshotRenderInput(source, DESIGN_LIMITS.documentBytes) as EmailDesignDocument['blocks']
  } catch (error) {
    if (error instanceof RenderBoundaryError) throw new EmailDesignError(error.code === 'LIMIT_EXCEEDED' ? 'LIMIT_EXCEEDED' : 'INVALID_DESIGN', 'composer_source')
    throw error
  }
  const rejectUnsafeNumbers = (value: unknown): void => {
    if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) throw new EmailDesignError('INVALID_DESIGN', 'number_precision')
    if (value && typeof value === 'object') Object.values(value).forEach(rejectUnsafeNumbers)
  }
  rejectUnsafeNumbers(blocks)
  const design = validateEmailDesign({
    schemaVersion: 1,
    kind: 'template',
    scope: { clientId },
    source: { editor: 'composer', nativeArtifact: null },
    blocks,
    rootChildrenIds: ['root'],
    lineage: [],
    dependencies: [],
    moduleInstances: [],
    assets: [],
    policy: { version: 1, editableFields: [] }
  })
  // Legacy column palettes can have spare slots, unknown fields, or unsupported
  // graphs. Validation above deliberately refuses rather than dropping data.
  design.policy = defaultDesignPolicy(design.blocks)
  design.policy.editableFields = design.policy.editableFields.filter((path) => {
    const [id, , , field] = path.split('.')
    const value = design.blocks[id].data.props?.[field]
    // Rich text remains in its original block, locked for this first native
    // mapping. Rendering it as plain native text would destroy markup on return.
    return typeof value === 'string'
      && (field !== 'text' || !/[<>&]/.test(value))
  })
  design.lineage = Object.entries(design.blocks).map(([blockId], index) => ({
    blockId,
    nodeId: `edm-node-${index}`,
    fields: Object.fromEntries(design.policy.editableFields
      .filter(path => path.startsWith(`${blockId}.`))
      .map((path, fieldIndex) => [path.split('.').at(-1)!, `edm-field-${index}-${fieldIndex}`]))
  }))
  const validated = validateEmailDesign(design)
  designToRendererDocument(validated)
  return validated
}

/** Content-only return validation against the persisted handoff baseline. The
 * native bridge is untrusted input, even for a designer. This milestone never
 * changes policy, layout, mobile overrides, asset manifests or module lineage. */
export function validateContentReturn(base: EmailDesignDocument, input: unknown): EmailDesignDocument {
  const next = validateEmailDesign(input)
  assertStaffDesignEdit(base, next)
  for (const path of base.policy.editableFields) {
    const [id, , , field] = path.split('.')
    const before = base.blocks[id]?.data.props?.[field]
    const after = next.blocks[id]?.data.props?.[field]
    if (before === after) continue
    const type = base.blocks[id].type
    const allowed = type === 'Text' || type === 'Heading'
      ? ['text']
      : type === 'Button'
        ? ['text', 'url']
        : type === 'Image' ? ['url', 'alt', 'linkHref'] : []
    if (!allowed.includes(field) || typeof after !== 'string' || new TextEncoder().encode(after).byteLength > 8192 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(after))
      throw new EmailDesignError('EDIT_FORBIDDEN', path)
    if (field === 'text' && (typeof before !== 'string' || /[<>&]/.test(before) || /[<>&]/.test(after)))
      throw new EmailDesignError('EDIT_FORBIDDEN', path)
    if (field === 'url' || field === 'linkHref') {
      const image = type === 'Image' && field === 'url'
      if (/[\u0000-\u0020<>"']/.test(after)) throw new EmailDesignError('INVALID_DESIGN', path)
      if (after === '' && !image) continue
      if (/^#[A-Za-z0-9_.:-]*$/.test(after) && !image) continue
      let url: URL
      try {
        url = new URL(after)
      } catch {
        throw new EmailDesignError('INVALID_DESIGN', path)
      }
      if (url.username || url.password || /[\u0000-\u0020<>"']/.test(after)
        || !(image ? ['https:'] : ['https:', 'http:', 'mailto:', 'tel:']).includes(url.protocol))
        throw new EmailDesignError('INVALID_DESIGN', path)
    }
  }
  designToRendererDocument(next)
  return next
}
