<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { Layer } from '~/types/banner-studio'
import { bannerAudioState } from '~~/shared/bannerAudioClock'

const props = defineProps<{ layers: Layer[], muted: boolean }>()
const emit = defineEmits<{ error: [message: string] }>()
const root = ref<HTMLElement>()
const tracks = computed(() => props.layers.filter(l => l.type === 'audio' && l.src && !l.hidden && !l.muted && (l.volume ?? 1) > 0))
const pending = new WeakSet<HTMLAudioElement>()
const failed = new WeakSet<HTMLAudioElement>()

// Called directly from the Play button, then by the selected artwork's timeline.
function sync(time: number, playing: boolean, gesture = false) {
  root.value?.querySelectorAll('audio').forEach((audio, index) => {
    const layer = tracks.value[index]
    if (!layer) return
    const start = layer.startTime || 0
    const end = layer.endTime || start + 3
    const sample = bannerAudioState(time - start, end - start, layer, audio.duration)
    const active = playing && sample.active
    if (gesture) failed.delete(audio)
    audio.volume = sample.volume
    audio.muted = props.muted || !active
    if (Math.abs(audio.currentTime - sample.time) > 0.25 || gesture) {
      try { audio.currentTime = sample.time } catch { /* Retry once metadata is available. */ }
    }
    if (!active) audio.pause()
    // Unlock delayed clips in this user gesture too. They stay muted until their start.
    if ((!active && !(gesture && playing && time < start)) || !audio.paused || pending.has(audio) || failed.has(audio)) return
    pending.add(audio)
    void audio.play().then(() => {
      if (!audio.isConnected || (!active && audio.muted)) audio.pause()
    }).catch((error: Error) => {
      if (error.name === 'AbortError' || !audio.isConnected) return
      failed.add(audio)
      emit('error', error.name === 'NotAllowedError' ? 'Sound was blocked. Press Replay to try again.' : 'The soundtrack could not load. Press Replay to try again.')
    }).finally(() => pending.delete(audio))
  })
}
onBeforeUnmount(() => root.value?.querySelectorAll('audio').forEach(audio => audio.pause()))
defineExpose({ sync })
</script>

<template>
  <div ref="root" hidden>
    <audio v-for="track in tracks" :key="track.id + ':' + track.src" :src="track.src" preload="metadata" :muted="muted" />
  </div>
</template>
