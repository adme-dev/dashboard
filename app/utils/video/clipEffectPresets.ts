// clipEffectPresets.ts — UI presentation for the per-clip effect presets.
// The preset IDS are owned by server/utils/audio/videoCompositeGraph.ts
// (CLIP_EFFECT_PRESETS — the ffmpeg mapping); this file only adds labels and
// icons for the drawer. A test asserts the two stay in sync.

export interface ClipEffectPresetUi {
  id: string
  label: string
  icon: string
  hint: string
}

export const CLIP_EFFECT_PRESET_UI: ClipEffectPresetUi[] = [
  { id: 'film_grain', label: 'Film grain', icon: 'i-lucide-film', hint: 'Organic 35mm-style grain' },
  { id: 'motion_blur', label: 'Motion blur', icon: 'i-lucide-wind', hint: 'Frame-blended movement' },
  { id: 'vhs', label: 'VHS', icon: 'i-lucide-tv', hint: 'Analog tape noise + color drift' },
  { id: 'shake', label: 'Shake', icon: 'i-lucide-vibrate', hint: 'Handheld camera energy' },
  { id: 'bloom', label: 'Bloom', icon: 'i-lucide-sun', hint: 'Soft glowing highlights' },
  { id: 'fisheye', label: 'Fisheye', icon: 'i-lucide-circle-dot', hint: 'Wide curved lens distortion' }
]
