// Per-format video output profiles. Mirrors profiles.ts (audio). Pure.
export type VideoFormatKey = 'reels_9x16' | 'square_1x1' | 'youtube_16x9'

export interface VideoFormat {
  format: VideoFormatKey
  codec: 'h264'
  width: number
  height: number
  fps: number
  videoBitrate: string     // ffmpeg -b:v
  audioLufs: number        // social default -14 (applied in a later loudness pass; recorded here)
  maxDurationSec: number | null
}

export const DEFAULT_VIDEO_FORMATS: Record<VideoFormatKey, VideoFormat> = {
  reels_9x16:   { format: 'reels_9x16',   codec: 'h264', width: 1080, height: 1920, fps: 30, videoBitrate: '8M', audioLufs: -14, maxDurationSec: 90 },
  square_1x1:   { format: 'square_1x1',   codec: 'h264', width: 1080, height: 1080, fps: 30, videoBitrate: '8M', audioLufs: -14, maxDurationSec: null },
  youtube_16x9: { format: 'youtube_16x9', codec: 'h264', width: 1920, height: 1080, fps: 30, videoBitrate: '12M', audioLufs: -14, maxDurationSec: null }
}

export function videoFormatFor(key: string, overrides?: Partial<VideoFormat>): VideoFormat | null {
  const base = DEFAULT_VIDEO_FORMATS[key as VideoFormatKey]
  if (!base) return null
  return overrides ? { ...base, ...overrides } : { ...base }
}
