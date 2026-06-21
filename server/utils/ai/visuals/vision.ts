import type { CaptionDeps } from './caption'

/**
 * Visuals → Knowledge — native Workers AI vision resolver (the injected `caption` dep for describeAsset).
 * Uses the same Cloudflare-native vision model the banner dissector already runs (`@cf/llava-hf/
 * llava-1.5-7b-hf`) — verified in-codebase, no external key. llava takes image BYTES (not a URL), so we
 * fetch the asset server-side and pass bytes: private-R2 assets work without any public/signed URL.
 *
 * Fully fail-safe: no AI binding, an un-fetchable asset, or a model error all yield '' → describeAsset
 * treats that as "no caption" and returns null. Both the binding and the byte-fetch are injected so this
 * is unit-testable without Cloudflare. This is the dormant resolver layer; the proof/banner triggers that
 * call it are the final wiring step (kept out until the operator picks inline-vs-queue + the flag).
 */

/** The Workers AI vision model — same one the banner dissector uses (id verified in bannerDissector.ts). */
export const VISION_MODEL = '@cf/llava-hf/llava-1.5-7b-hf'

/** Minimal shape of the Cloudflare Workers AI binding we need. */
export interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>
}

/** Fetch an asset's raw bytes (server-side, so private R2 is fine). Returns null on any failure. */
export type FetchBytes = (url: string) => Promise<Uint8Array | null>

const defaultFetchBytes: FetchBytes = async (url) => {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Build a `caption(prompt, imageUrl)` function backed by Workers AI vision. Never throws — every failure
 * mode returns '' so the pure core's fail-safe path (describeAsset → null) takes over.
 */
export function makeWorkersAiVision(ai: AiBinding | null, fetchBytes: FetchBytes = defaultFetchBytes): CaptionDeps['caption'] {
  return async (prompt: string, imageUrl: string): Promise<string> => {
    if (!ai || !imageUrl) return ''
    try {
      const bytes = await fetchBytes(imageUrl)
      if (!bytes || bytes.length === 0) return ''
      const result = await ai.run(VISION_MODEL, {
        image: Array.from(bytes),
        prompt,
        max_tokens: 512,
        temperature: 0.2
      }) as { description?: string, response?: string } | null
      return (result?.description || result?.response || '').toString()
    } catch {
      return ''
    }
  }
}
