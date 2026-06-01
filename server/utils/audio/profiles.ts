// server/utils/audio/profiles.ts — per-channel loudness/container profiles for the
// Phase 3 render tier. NOT hardcoded into the render logic: callers pass a profile,
// and these defaults are overridable (env/KV) without a redeploy.
//
// Targets (2026): social (TikTok/IG/Meta) ≈ -14 LUFS, -1 dBTP true peak; broadcast/
// commercial radio ≈ -24 LKFS (AU Free TV OP-59 / US ATSC A/85; EBU R128 = -23).
// ⚠️ Radio is the DELIVERING NETWORK's spec — confirm per station, don't assume -24.

export type AudioChannel = 'radio' | 'tiktok' | 'meta'

export interface ChannelProfile {
  channel: AudioChannel
  /** Integrated loudness target (LUFS / LKFS). */
  lufs: number
  /** True-peak ceiling (dBTP). */
  truePeak: number
  /** Target loudness range. */
  lra: number
  /** Delivery container/codec. */
  format: 'mp3' | 'wav'
  /** Trim to at most this many seconds (social cutdowns); null = keep full length. */
  maxDurationSec: number | null
  /** Fade-out length applied at the end (seconds); 0 = none. */
  fadeOutSec: number
}

export const DEFAULT_PROFILES: Record<AudioChannel, ChannelProfile> = {
  // Broadcast: louder ceiling discipline, WAV delivery, no fade/trim by default.
  radio: { channel: 'radio', lufs: -24, truePeak: -1, lra: 7, format: 'wav', maxDurationSec: null, fadeOutSec: 0 },
  // Short-form vertical video: -14 LUFS, mp3, 60s cap, gentle fade.
  tiktok: { channel: 'tiktok', lufs: -14, truePeak: -1, lra: 11, format: 'mp3', maxDurationSec: 60, fadeOutSec: 0.5 },
  // Meta adapts playback loudness (xHE-AAC); -14 is the safe master.
  meta: { channel: 'meta', lufs: -14, truePeak: -1, lra: 11, format: 'mp3', maxDurationSec: null, fadeOutSec: 0.5 }
}

/** Resolve a channel to its profile, applying optional per-call overrides
 * (e.g. a network-specific radio LUFS). Returns null for an unknown channel. */
export function profileFor(channel: string, overrides?: Partial<ChannelProfile>): ChannelProfile | null {
  const base = DEFAULT_PROFILES[channel as AudioChannel]
  if (!base) return null
  return overrides ? { ...base, ...overrides } : { ...base }
}
