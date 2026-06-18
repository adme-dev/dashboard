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
    tagline: 'Animate a brand still with quiet atmosphere',
    icon: 'i-lucide-clapperboard',
    mode: 'image-to-video',
    prompt: 'Subtle cinematic movement from the source image: slow dolly drift, warm morning light, soft bokeh, gentle environmental motion in the background. Keep the subject and brand details stable while adding an authentic documentary feel.',
    durationSeconds: 10
  },
  {
    id: 'offer-background-loop',
    title: 'Offer background',
    tagline: 'Motion bed for price or offer overlays',
    icon: 'i-lucide-badge-percent',
    mode: 'image-to-video',
    prompt: 'Create a clean advertising background loop from the source image. Slow parallax, soft light movement, premium but restrained motion, clear negative space for price or offer graphics. Do not add text; preserve product shape and brand details.',
    durationSeconds: 5
  },
  {
    id: 'showroom-walkaround',
    title: 'Showroom walkaround',
    tagline: 'Dealer-style walkaround motion',
    icon: 'i-lucide-route',
    mode: 'image-to-video',
    prompt: 'Smooth handheld showroom walkaround from the source image. Gentle camera move along the vehicle or product, realistic reflections, polished dealership lighting, natural depth, steady professional pacing. Keep logos, bodywork and proportions consistent.',
    durationSeconds: 10
  }
]

export function resolveGenerationTemplate(id: string): VideoGenerationTemplate | null {
  return VIDEO_GENERATION_TEMPLATES.find(template => template.id === id) ?? null
}
