<script setup>
import { ref } from 'vue'
const opened = ref('')
</script>
<template>
  <main>
    <header><p>DASHBOARD · AI ASSISTANT</p><h1>The original animation.</h1><p>Exact source animation. No colour filter or extra outline.</p></header>
    <div class="comparison">
      <section class="dark"><h2>Dark surface</h2><div class="hero-orb"><AiReferenceOrb /></div><footer><span>Activity Hub</span><AiOrbLauncher label="Open Activity Hub" @click="opened = 'Activity Hub'" /></footer></section>
      <section class="light"><h2>Light surface</h2><div class="hero-orb"><AiReferenceOrb /></div><footer><span>Portal Assistant</span><AiOrbLauncher label="Open Portal Assistant" @click="opened = 'Portal Assistant'" /></footer></section>
    </div>
    <p class="note">Source colours, folds and timing are preserved. The original black background stays inside the softly cropped circle.</p>
    <section v-if="opened" class="result" role="status">{{ opened }} launcher activated.<UButton color="neutral" variant="outline" @click="opened = ''">Close preview</UButton></section>
  </main>
</template>
