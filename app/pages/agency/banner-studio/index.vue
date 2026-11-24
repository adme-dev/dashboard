<script setup lang="ts">
definePageMeta({ path: '/agency/banner-studio/:trail(folders/.*|folders)?', key: 'agency-banner-library', layout: 'agency', middleware: ['role-creative'] })
</script>

<template>
  <BannerProjectLibrary />
</template>
