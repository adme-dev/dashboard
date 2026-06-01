<script setup lang="ts">
import type { AudioAsset } from '~/types'

const { listVoiceovers } = useAudioStudio()
const { data, refresh } = listVoiceovers()

function onGenerated(_asset: AudioAsset) {
  refresh()
}
</script>

<template>
  <div class="max-w-3xl mx-auto p-6 space-y-8">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">Audio Studio</h1>
      <p class="text-sm text-muted">
        Generate owned voiceover you can use across radio, TikTok and Meta — no clearance, no takedown risk.
      </p>
    </header>

    <AudioVoiceoverForm @generated="onGenerated" />

    <section class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Library</h2>
      <AudioAssetLibrary :assets="data?.assets ?? []" />
    </section>
  </div>
</template>
