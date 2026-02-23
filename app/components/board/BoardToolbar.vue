<template>
  <div class="bg-white border-b px-4 py-2 flex items-center gap-4">
    <UButton variant="ghost" size="sm" icon="i-lucide-filter" @click="$emit('filter')">Filter</UButton>
    <UButton variant="ghost" size="sm" icon="i-lucide-arrow-up-down" @click="$emit('sort')">Sort</UButton>
    <UButton variant="ghost" size="sm" icon="i-lucide-eye" @click="$emit('hide')">Hide</UButton>
    <UButton variant="ghost" size="sm" icon="i-lucide-layers" @click="$emit('group')">Group</UButton>
    <div class="flex-1" />
    <UButton variant="ghost" size="sm" icon="i-lucide-download" @click="$emit('export')">Export</UButton>
    <UButton variant="ghost" size="sm" icon="i-lucide-layout-template" @click="$emit('template')">Templates</UButton>
    <div class="w-px h-5 bg-gray-200" />
    <UButton variant="ghost" size="sm" icon="i-lucide-folder-plus" @click="$emit('addGroup')">Add Group</UButton>
    <UButton variant="ghost" size="sm" icon="i-lucide-plus" @click="$emit('addColumn')">Add Column</UButton>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  filter: []
  sort: []
  hide: []
  group: []
  export: []
  template: []
  addGroup: []
  addColumn: []
}>()
</script>
