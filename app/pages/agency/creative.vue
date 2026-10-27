<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })
useSeoMeta({ title: 'Creative Studio' })

const studios = [
  {
    title: 'Images & artwork',
    description: 'Build campaign artwork with editable text, images and animation. Work from a brief, a template or an existing project.',
    icon: 'i-lucide-palette',
    action: 'Open Banner Studio',
    to: '/agency/banner-studio',
    detail: 'Banners, campaign concepts and image layers'
  },
  {
    title: 'Video',
    description: 'Arrange footage, titles and audio on a timeline. Open a video project to prepare clips, review renders and continue editing.',
    icon: 'i-lucide-clapperboard',
    action: 'Open Video Studio',
    to: '/agency/audio/projects?mediaType=av',
    detail: 'Clips, timelines and video projects'
  },
  {
    title: 'Audio',
    description: 'Create voiceover and music with your configured providers, then use your audio library in a campaign or timeline.',
    icon: 'i-lucide-audio-lines',
    action: 'Open Audio Studio',
    to: '/agency/audio',
    detail: 'Voiceover, music and audio projects'
  }
]

const resources = [
  { title: 'Banner templates', description: 'Start with an existing layout.', icon: 'i-lucide-layout-template', to: '/agency/banner-studio/templates' },
  { title: 'Brand kits', description: 'Keep logos, fonts and colours consistent.', icon: 'i-lucide-paintbrush', to: '/agency/banner-studio/brand-kits' },
  { title: 'Audio projects', description: 'Continue working on a saved timeline.', icon: 'i-lucide-music', to: '/agency/audio/projects' },
  { title: 'Upload banners', description: 'Bring existing creative into your library.', icon: 'i-lucide-upload', to: '/agency/banner-studio/upload' }
]
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col" data-testid="creative-studio-home">
    <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
      <div class="mx-auto max-w-6xl space-y-10 sm:space-y-14">
        <header class="max-w-2xl space-y-4 pt-2 sm:pt-6">
          <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
            Your next campaign starts here.
          </h1>
          <p class="text-base leading-relaxed text-muted sm:text-lg">
            Choose a studio to create something new or pick up an existing project.
            Keep the artwork, video and audio for your campaign close at hand.
          </p>
        </header>

        <section aria-labelledby="creative-studios-title" class="space-y-5">
          <h2 id="creative-studios-title" class="text-lg font-semibold text-highlighted">
            Creative studios
          </h2>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <UCard v-for="studio in studios" :key="studio.to" :ui="{ body: 'flex h-full flex-col p-5 sm:p-6' }">
              <UIcon :name="studio.icon" class="mb-6 size-8 text-primary" aria-hidden="true" />
              <h3 class="text-xl font-semibold tracking-tight text-highlighted">
                {{ studio.title }}
              </h3>
              <p class="mt-3 flex-1 text-sm leading-6 text-muted">
                {{ studio.description }}
              </p>
              <p class="mt-6 text-xs text-muted">
                {{ studio.detail }}
              </p>
              <UButton
                :to="studio.to"
                color="neutral"
                variant="outline"
                class="mt-4 w-full justify-center"
              >
                {{ studio.action }}
              </UButton>
            </UCard>
          </div>
        </section>

        <section aria-labelledby="creative-resources-title" class="space-y-5 pb-6">
          <h2 id="creative-resources-title" class="text-lg font-semibold text-highlighted">
            Reuse your work
          </h2>
          <div class="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div v-for="resource in resources" :key="resource.to" class="flex items-center gap-4 border-t border-default py-5">
              <UIcon :name="resource.icon" class="size-5 shrink-0 text-muted" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <UButton
                  :to="resource.to"
                  color="neutral"
                  variant="link"
                  class="p-0 font-medium text-highlighted"
                >
                  {{ resource.title }}
                </UButton>
                <p class="mt-1 text-sm text-muted">
                  {{ resource.description }}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
