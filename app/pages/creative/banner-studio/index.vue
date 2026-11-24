<script setup lang="ts">
definePageMeta({ path: '/creative/banner-studio/:trail(folders/.*|folders)?', key: 'creative-banner-library', layout: false, middleware: ['role-creative'] })
</script>

<template>
  <BannerProjectLibrary full-screen />
</template>
