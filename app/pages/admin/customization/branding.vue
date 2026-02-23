<template>
  <div class="h-full flex flex-col bg-gray-50">
    <div class="bg-white border-b px-6 py-4">
      <h1 class="text-2xl font-semibold">Branding</h1>
      <p class="text-gray-500 mt-1">Manage branding</p>
    </div>
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <UIcon name="i-lucide-construction" class="w-16 h-16 mx-auto text-gray-300 mb-4" />
        <h2 class="text-xl font-medium text-gray-900">Coming Soon</h2>
        <p class="text-gray-500 mt-2">This feature is under development</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })
</script>
