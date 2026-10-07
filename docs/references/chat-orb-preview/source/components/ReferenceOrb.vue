<script setup lang="ts">
import { onMounted, ref } from 'vue'

const image = ref<HTMLImageElement | null>(null)
const still = ref<HTMLCanvasElement | null>(null)

// Keep a frame of the actual artwork for reduced motion, rather than replacing
// it with a different illustration. Also handle an image cached before hydration.
function captureStill() {
  if (!image.value?.complete || !image.value.naturalWidth) return
  still.value?.getContext('2d')?.drawImage(image.value, 0, 0, 400, 300)
}

onMounted(captureStill)
</script>

<template>
  <span class="reference-orb" aria-hidden="true">
    <img
      ref="image"
      class="reference-orb__animation"
      src="/animations/ai-orb-reference.gif"
      width="400"
      height="300"
      alt=""
      draggable="false"
      @load="captureStill"
    >
    <canvas
      ref="still"
      class="reference-orb__still"
      width="400"
      height="300"
    />
  </span>
</template>

<style scoped>
.reference-orb {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 50%;
  isolation: isolate;
  pointer-events: none;
  /* Feather only the outer black padding. The reference artwork is unchanged. */
  mask-image: radial-gradient(closest-side, #000 92%, transparent 100%);
}

.reference-orb img,
.reference-orb canvas {
  position: absolute;
  left: 50%;
  top: 50%;
  /* Show the central 224px square of the 400 x 300 source at its native ratio. */
  width: 178.571429%;
  height: auto;
  max-width: none;
  transform: translate(-50%, -50%);
}

.reference-orb__still { display: none; }

@media (prefers-reduced-motion: reduce) {
  .reference-orb__animation { display: none; }
  .reference-orb__still { display: block; }
}
</style>
