// generationTemplates.ts — curated starting points for the AI video composer.
// PURE data + lookup. Each template prefills the Generate composer (mode, prompt,
// duration); the user can still edit everything before submitting. Prompts are
// written for an agency context (client product/vehicle/brand work), not stock-art.
import type { VideoGenerationMode } from '~~/server/utils/video-generation/types'

export interface VideoGenerationTemplate {
  id: string
  title: string
  tagline: string
  icon: string
  mode: Extract<VideoGenerationMode, 'text-to-video' | 'image-to-video'>
  prompt: string
  durationSeconds: number
}

export const VIDEO_GENERATION_TEMPLATES: VideoGenerationTemplate[] = [
  {
    id: 'cinematic-product-reveal',
    title: 'Cinematic product reveal',
    tagline: 'Animate a product still with a slow push-in',
    icon: 'i-lucide-package-open',
    mode: 'image-to-video',
    prompt: 'Slow cinematic camera push-in on the product. Soft studio lighting with a gentle specular sweep across the surface, shallow depth of field, subtle floating dust particles catching the light. Premium, calm, high-end commercial feel.',
    durationSeconds: 5
  },
  {
    id: 'vehicle-hero-motion',
    title: 'Vehicle hero motion',
    tagline: 'Bring a vehicle still to life',
    icon: 'i-lucide-car-front',
    mode: 'image-to-video',
    prompt: 'The vehicle drives forward with wheels rotating naturally, kicking up a light trail of dust. Cinematic tracking shot, golden-hour sunlight, heat shimmer on the horizon, dramatic automotive-commercial energy. Keep the vehicle bodywork, badging and proportions exactly as in the source image.',
    durationSeconds: 5
  },
  {
    id: 'frozen-frame-orbit',
    title: '360° frozen frame',
    tagline: 'Camera orbits a frozen moment',
    icon: 'i-lucide-rotate-3d',
    mode: 'image-to-video',
    prompt: 'Freeze the subject completely in time while the camera performs a smooth 360-degree orbit around it. Bullet-time effect, motionless subject, consistent lighting throughout the orbit, dramatic and polished.',
    durationSeconds: 5
  },
  {
    id: 'brand-story-broll',
    title: 'Brand story b-roll',
    tagline: 'Warm lifestyle montage for brand films',
    icon: 'i-lucide-clapperboard',
    mode: 'text-to-video',
    prompt: 'Warm cinematic lifestyle b-roll: morning light through a window, hands at work on a craft, slow dolly across a workspace with soft bokeh. Natural color grade with gentle film grain, authentic documentary feel, no on-screen text.',
    durationSeconds: 10
  },
  {
    id: 'city-walk',
    title: 'City walk',
    tagline: 'Urban energy for socials',
    icon: 'i-lucide-footprints',
    mode: 'text-to-video',
    prompt: 'Steadicam follow shot through a lively city street at dusk. Neon signs reflecting on wet pavement, anonymous passers-by in motion blur, vertical-friendly framing, energetic but smooth camera movement, moody cinematic grade.',
    durationSeconds: 5
  },
  {
    id: 'product-ad-vo-bed',
    title: 'Voiceover ad bed',
    tagline: 'Clean b-roll to sit under a VO',
    icon: 'i-lucide-mic',
    mode: 'text-to-video',
    prompt: 'Clean minimal product-commercial b-roll: slow panning shots over neutral textured backgrounds, soft gradients of light, unhurried pacing with long takes designed to sit under a voiceover. No text, no people, calm premium tone.',
    durationSeconds: 10
  }
]

export function resolveGenerationTemplate(id: string): VideoGenerationTemplate | null {
  return VIDEO_GENERATION_TEMPLATES.find(template => template.id === id) ?? null
}
