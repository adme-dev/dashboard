/**
 * Visuals → Knowledge V-1 (visuals-to-knowledge spec §3). Turns a visual asset (proof / banner /
 * generated image / video frame) into TEXT knowledge the assistant can search and reason over — the
 * Cloudflare-native "caption-to-text" path. PURE prompt + tolerant parser + candidate builder; the
 * vision model is injected so the core is unit-testable without a model. A caption is a CANDIDATE —
 * it flows through the existing propose→review→publish gate (KB) or the DS-2 department gate; it is
 * NEVER auto-published. Multimodal-embedding visual-similarity search is a deferred phase-2.
 */

import type { MemScope } from '../memory/types'

export type VisualKind = 'proof' | 'banner' | 'image' | 'video'

export interface VisualAsset {
  id: string
  kind: VisualKind
  /** The image/thumbnail URL the vision model reads + the assistant links back to. */
  url: string
  title?: string
  /** Optional context for a better caption (client, project, campaign). */
  context?: { clientName?: string, projectName?: string, campaignName?: string }
}

export interface VisualKnowledge {
  assetId: string
  assetKind: VisualKind
  assetUrl: string
  caption: string
  tags: string[]
  /** Default 'user'; promotion to department/org is human-gated (DS-2 / KB publish). */
  scope: MemScope
}

/** Build the vision prompt. Steers toward a factual caption + concise tags, with any context woven in. */
export function buildCaptionPrompt(asset: VisualAsset): string {
  const ctx = asset.context
  const ctxLine = [
    ctx?.clientName && `Client: ${ctx.clientName}`,
    ctx?.projectName && `Project: ${ctx.projectName}`,
    ctx?.campaignName && `Campaign: ${ctx.campaignName}`,
    asset.title && `Title: ${asset.title}`,
  ].filter(Boolean).join(' · ')

  return `Describe this ${asset.kind} for a marketing-agency knowledge base so a teammate could find it later by searching.`
    + (ctxLine ? `\nContext — ${ctxLine}.` : '')
    + `\nReturn ONLY JSON: {"caption": "<one factual sentence: what it shows, key text/brand, style>", "tags": ["<3-8 short lowercase tags>"]}.`
    + `\nDo not invent a client/brand not given in context. No commentary.`
}

/** Tolerant parse of the vision model's reply → caption + tags. Strips code fences; salvages a bare line. */
export function parseCaption(raw: string): { caption: string, tags: string[] } {
  const text = (raw ?? '').trim()
  if (!text) return { caption: '', tags: [] }
  const body = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const m = body.match(/\{[\s\S]*\}/)
    if (m) {
      const obj = JSON.parse(m[0])
      const caption = typeof obj?.caption === 'string' ? obj.caption.trim() : ''
      const tags = Array.isArray(obj?.tags)
        ? obj.tags.filter((t: unknown): t is string => typeof t === 'string').map((t: string) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8)
        : []
      if (caption) return { caption, tags: Array.from(new Set<string>(tags)) }
    }
  } catch {
    /* fall through to plain-text salvage */
  }
  // Salvage: treat the first non-empty line as the caption (the model ignored the JSON instruction).
  const firstLine = body.split('\n').map(s => s.trim()).find(Boolean) ?? ''
  return { caption: firstLine.slice(0, 300), tags: [] }
}

/**
 * Compose the searchable knowledge content for a captioned asset. One line the KB/memory indexes; the
 * assistant links the asset via assetUrl. Kept terse so it embeds well.
 */
export function toKnowledgeContent(vk: VisualKnowledge): string {
  const ctxTag = vk.tags.length ? ` [${vk.tags.join(', ')}]` : ''
  return `${capitalize(vk.assetKind)}: ${vk.caption}${ctxTag}`
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

export interface CaptionDeps {
  /** Vision model: given the prompt + image URL, return the raw reply. Default = Workers AI vision (wired at I/O time). */
  caption: (prompt: string, imageUrl: string) => Promise<string>
}

/**
 * Produce a VisualKnowledge candidate for an asset. Fail-safe: a model error or empty caption yields null
 * (the caller simply skips it). Scope defaults to 'user' — promotion to shared scope is always human-gated.
 */
export async function describeAsset(asset: VisualAsset, deps: CaptionDeps, scope: MemScope = 'user'): Promise<VisualKnowledge | null> {
  if (!asset?.id || !asset?.url) return null
  try {
    const raw = await deps.caption(buildCaptionPrompt(asset), asset.url)
    const { caption, tags } = parseCaption(raw)
    if (!caption) return null
    return { assetId: asset.id, assetKind: asset.kind, assetUrl: asset.url, caption, tags, scope }
  } catch {
    return null
  }
}
