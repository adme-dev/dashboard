<script setup lang="ts">
import type { AudioAsset } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { listVoiceovers, listMusic } = useAudioStudio()
const { data: voData, refresh: refreshVo } = listVoiceovers()
const { data: muData, refresh: refreshMu } = listMusic()

const tabs = [
  { label: 'Voiceover', icon: 'i-lucide-mic', slot: 'voiceover' as const },
  { label: 'Music', icon: 'i-lucide-music', slot: 'music' as const }
]

function onVoGenerated(_asset: AudioAsset) {
  refreshVo()
}
function onMuGenerated(_asset: AudioAsset) {
  refreshMu()
}
</script>

<template>
  <div class="max-w-3xl mx-auto p-6 space-y-8">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        Audio Studio
      </h1>
      <p class="text-sm text-muted">
        Generate owned voiceover and music you can use across radio, TikTok and Meta — no clearance, no takedown risk.
      </p>
    </header>

    <UTabs :items="tabs" variant="link" class="gap-6">
      <template #voiceover>
        <div class="space-y-8 pt-2">
          <AudioVoiceoverForm @generated="onVoGenerated" />
          <section class="space-y-3">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">
              Voiceover library
            </h2>
            <AudioAssetLibrary :assets="voData?.assets ?? []" kind="voiceover" />
          </section>
        </div>
      </template>

      <template #music>
        <div class="space-y-8 pt-2">
          <AudioMusicForm @generated="onMuGenerated" />
          <section class="space-y-3">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">
              Music library
            </h2>
            <AudioAssetLibrary :assets="muData?.assets ?? []" kind="music" />
          </section>
        </div>
      </template>
    </UTabs>
  </div>
</template>
