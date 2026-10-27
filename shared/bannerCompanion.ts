import { z } from 'zod'
import type { BannerProject, Layer } from '../app/types/banner-studio'
import { assessBridgeLayers, canonicalBridgeJson } from './bannerDocumentBridge'
import { isSafeBannerRewrite } from './bannerCopyProtection'
import { BANNER_PINNED_FONT } from './bannerPinnedFont'

/** Files carry suggestions, never browser-session authority. */
export const COMPANION_VERSION = 'banner-companion-wording/v1' as const
export const COMPANION_REQUEST_MAX_BYTES = 64 * 1024 * 1024
export const COMPANION_PROPOSAL_MAX_BYTES = 64 * 1024
export const COMPANION_TEXT_MAX_CHARS = 4000
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const identity = {
  version: z.literal(COMPANION_VERSION),
  requestId: z.string().uuid(),
  sourceHash: hash,
  boardKey: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-zA-Z0-9_-]+$/),
  layerId: z.number().int().positive().safe(),
  revision: z.number().int().nonnegative().safe(),
  fontHash: z.literal(BANNER_PINNED_FONT.sha256)
}

// Restrict to the proven native/browser glyph set, excluding C1 controls, NBSP,
// bidi controls, line separators, malformed surrogates and unproven fallback.
export function isCompanionWording(text: string): boolean {
  return (
    !!text.trim()
    && text.length <= COMPANION_TEXT_MAX_CHARS
    && [...text].every((char) => {
      const code = char.codePointAt(0)!
      return (
        (code >= 32 && code <= 126)
        || (code >= 161 && code <= 255)
        || [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022].includes(code)
      )
    })
  )
}

const snapshot = z.custom<BannerProject>((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const project = value as BannerProject
  if (
    typeof project.id !== 'string'
    || !project.id
    || typeof project.name !== 'string'
    || !project.canvasData
    || typeof project.canvasData !== 'object'
    || Array.isArray(project.canvasData)
  )
    return false
  return Object.values(project.canvasData).every(board => board && Array.isArray(board.layers))
}, 'A complete canonical project snapshot is required')

// Zod intentionally drops __proto__ while parsing objects. Check original own
// keys first so even that field rejects instead of silently disappearing.
function strictRecord<T extends z.ZodRawShape>(shape: T) {
  return z.preprocess((value, context) => {
    if (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && Object.keys(value).some(key => !Object.hasOwn(shape, key))
    ) {
      context.addIssue({ code: 'custom', message: 'Unknown companion field' })
    }
    return value
  }, z.object(shape).strict())
}
export const companionRequestSchema = strictRecord({ ...identity, snapshot })
export const companionEngineSchema = strictRecord({
  name: z.literal('PhotoCraft'),
  version: z.literal('0.16.0'),
  platform: z.literal('linux')
})
export const companionProposalSchema = strictRecord({
  ...identity,
  text: z.string().max(COMPANION_TEXT_MAX_CHARS).refine(isCompanionWording, 'Unsupported single-line wording'),
  engine: companionEngineSchema
})
export type CompanionRequest = z.infer<typeof companionRequestSchema>
export type CompanionProposal = z.infer<typeof companionProposalSchema>
export interface CompanionEditMetadata {
  kind: 'manual-companion-wording'
  engineVerified: false
  declaredEngine: CompanionProposal['engine']
  requestId: string
  sourceHash: string
  fontHash: string
}

function parseBounded(raw: string, limit: number): unknown {
  if (typeof raw !== 'string' || raw.length > limit || new TextEncoder().encode(raw).byteLength > limit)
    throw new Error('Companion file exceeds its size limit')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('Companion file must be valid JSON')
  }
}

export function companionBlockReason(layer: Layer | null | undefined, layers: Layer[] = layer ? [layer] : []): string {
  if (!layer || layer.type !== 'text') return 'Select a native text heading to use the companion.'
  if (!isCompanionWording(layer.text || '')) return 'This heading contains unsupported characters or multiple lines.'
  if ((layer.fontSize || 0) > 512)
    return 'This heading exceeds the supported 512 px font size. Its style will not be converted.'
  try {
    const assessment = assessBridgeLayers(layers, [
      { family: BANNER_PINNED_FONT.family, weight: BANNER_PINNED_FONT.weight, italic: false }
    ]).find(item => item.id === layer.id)
    if (!assessment || assessment.readOnly)
      return 'Locked, approved, factual, feed-bound and protected wording cannot use the companion.'
    if (assessment.kind !== 'text')
      return `This heading is unsupported: ${assessment.reasons.join('; ')}. Use an existing plain Source Sans 3 Bold heading; its style will not be converted.`
    return ''
  } catch {
    return 'This document has invalid or duplicate layer identities.'
  }
}

export function parseCompanionRequest(raw: string): CompanionRequest {
  const request = companionRequestSchema.parse(parseBounded(raw, COMPANION_REQUEST_MAX_BYTES))
  // Also reject non-finite numbers accepted by JSON.parse (for example 1e999).
  canonicalBridgeJson(request)
  const layers = request.snapshot.canvasData[request.boardKey]?.layers || []
  const layer = layers.find(item => item.id === request.layerId)
  const reason = companionBlockReason(layer, layers)
  if (reason) throw new Error(reason)
  return request
}

export function parseCompanionProposal(raw: string): CompanionProposal {
  return companionProposalSchema.parse(parseBounded(raw, COMPANION_PROPOSAL_MAX_BYTES))
}

/** Match only against the original request retained by the initiating browser. */
export function validateCompanionProposal(value: unknown, request: CompanionRequest): CompanionProposal {
  const proposal = companionProposalSchema.parse(value)
  for (const key of ['version', 'requestId', 'sourceHash', 'boardKey', 'layerId', 'revision', 'fontHash'] as const) {
    if (proposal[key] !== request[key])
      throw new Error('This file belongs to a different or stale companion request. Download a new request.')
  }
  const layers = request.snapshot.canvasData[request.boardKey]?.layers || []
  const layer = layers.find(item => item.id === request.layerId)
  const reason = companionBlockReason(layer, layers)
  if (reason) throw new Error(reason)
  if (proposal.text === layer!.text) throw new Error('The returned wording is unchanged.')
  if (!isSafeBannerRewrite(layer!.text!, proposal.text, layer!.copyLocked))
    throw new Error('The returned wording changes protected copy or introduces detected facts.')
  return proposal
}
