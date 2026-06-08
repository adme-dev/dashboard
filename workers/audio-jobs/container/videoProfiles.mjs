// workers/audio-jobs/container/videoProfiles.mjs — plain-JS mirror of
// server/utils/audio/videoProfiles.ts. Kept in sync manually; the format
// definitions are the canonical source of truth.
// Used by workers/audio-jobs/src/index.ts (the queue branch) to resolve a
// format key to a VideoFormat object before handing it to renderComposite.

export const DEFAULT_VIDEO_FORMATS = {
  reels_9x16:   { format: 'reels_9x16',   codec: 'h264', width: 1080, height: 1920, fps: 30, videoBitrate: '8M',  audioLufs: -14, maxDurationSec: 90 },
  square_1x1:   { format: 'square_1x1',   codec: 'h264', width: 1080, height: 1080, fps: 30, videoBitrate: '8M',  audioLufs: -14, maxDurationSec: null },
  youtube_16x9: { format: 'youtube_16x9', codec: 'h264', width: 1920, height: 1080, fps: 30, videoBitrate: '12M', audioLufs: -14, maxDurationSec: null }
}

/** Returns the VideoFormat for key, or null when unrecognised. */
export function videoFormatFor(key, overrides) {
  const base = DEFAULT_VIDEO_FORMATS[key]
  if (!base) return null
  return overrides ? { ...base, ...overrides } : { ...base }
}
