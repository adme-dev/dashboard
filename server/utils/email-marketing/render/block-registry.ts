/**
 * EDM Block Registry
 *
 * Central registry for email block definitions. Each block type registers
 * its render functions (MJML, HTML, optional Maizzle) so the three
 * renderers can delegate to a single source of truth instead of
 * maintaining independent switch statements.
 *
 * Usage:
 *   import { registerBlock, renderBlock } from './block-registry'
 *
 *   registerBlock({ type: 'heading', renderMjml: ..., renderHtml: ... })
 *   const mjml = renderBlock(block, 'mjml', context)
 */

import type { BlockDefinition, BlockRenderContext, FlyhubBlock, RenderFormat } from './blocks/types'

// ---------------------------------------------------------------------------
// Internal registry state
// ---------------------------------------------------------------------------

// Pinned on globalThis so the registry survives Vite SSR HMR. Without this, an
// HMR cycle can re-evaluate this module (creating a fresh Map) without
// re-evaluating the block files that called registerBlock(), leaving the
// renderer with an empty registry that returns "available in upcoming update"
// placeholders for every block — including the EmailLayout root.
const REGISTRY_KEY = '__edmBlockRegistry'
const globalRegistry = globalThis as Record<string, unknown>
const registry: Map<string, BlockDefinition>
  = (globalRegistry[REGISTRY_KEY] as Map<string, BlockDefinition>)
    ?? (globalRegistry[REGISTRY_KEY] = new Map<string, BlockDefinition>())

// ---------------------------------------------------------------------------
// Registry API
// ---------------------------------------------------------------------------

/**
 * Register a block definition. Overwrites any previous definition for the
 * same `type`.
 */
export function registerBlock(definition: BlockDefinition): void {
  registry.set(definition.type, definition)
}

/**
 * Retrieve a block definition by type, or `undefined` if not registered.
 */
export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return registry.get(type)
}

/**
 * Check whether a block type has been registered.
 */
export function hasBlock(type: string): boolean {
  return registry.has(type)
}

/**
 * Return an array of all registered block type identifiers.
 */
export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys())
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Render a block to the requested format.
 *
 * - Looks up the block definition by `block.type`.
 * - Calls the appropriate render function (mjml / html / maizzle).
 * - For maizzle, falls back to `renderHtml` when `renderMaizzle` is absent.
 * - Returns a styled placeholder for unregistered block types so emails
 *   degrade gracefully instead of breaking.
 */
export function renderBlock(
  block: FlyhubBlock,
  format: RenderFormat,
  context: BlockRenderContext
): string {
  const definition = registry.get(block.type)

  if (!definition) {
    return renderPlaceholder(block.type, format)
  }

  switch (format) {
    case 'mjml':
      return definition.renderMjml(block, context)
    case 'html':
      return definition.renderHtml(block, context)
    case 'maizzle':
      return (definition.renderMaizzle ?? definition.renderHtml)(block, context)
    default:
      return definition.renderHtml(block, context)
  }
}

// ---------------------------------------------------------------------------
// Placeholder for unregistered blocks
// ---------------------------------------------------------------------------

function renderPlaceholder(type: string, format: RenderFormat): string {
  const message = `[${type}] \u2014 available in upcoming update`

  if (format === 'mjml') {
    return [
      '<mj-section>',
      '  <mj-column>',
      `    <mj-text padding="12px 16px" font-size="13px" color="#94a3b8" font-style="italic" container-background-color="#f8fafc" border="1px dashed #cbd5e1" border-radius="4px">`,
      `      ${message}`,
      '    </mj-text>',
      '  </mj-column>',
      '</mj-section>'
    ].join('\n')
  }

  // HTML and Maizzle — email-safe table placeholder
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;">',
    '  <tr>',
    '    <td style="padding:12px 16px;font-size:13px;color:#94a3b8;font-style:italic;background-color:#f8fafc;border:1px dashed #cbd5e1;border-radius:4px;font-family:Arial,sans-serif;">',
    `      ${message}`,
    '    </td>',
    '  </tr>',
    '</table>'
  ].join('\n')
}
