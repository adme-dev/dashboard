<script setup lang="ts">
const model = defineModel<string>({ required: true })
defineProps<{ disabled?: boolean }>()
const topics = ['Photography', 'Design', 'Education', 'Consulting', 'Art', 'Automotive', 'Health and wellness', 'Marketing', 'Technology', 'Retail', 'Food and hospitality', 'Trades and construction', 'Professional services', 'Community organisation']
const topicSearch = ref('')
const visibleTopics = computed(() => topics.filter(topic => topic.toLowerCase().includes(topicSearch.value.trim().toLowerCase())))
const customTopic = computed(() => topicSearch.value.trim().slice(0, 100))
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-6">
    <UFormField label="Website topic" :ui="{ label: 'sr-only' }" required>
      <UInput
        v-model="topicSearch"
        icon="i-lucide-search"
        placeholder="Search for your site topic"
        :maxlength="100"
        size="xl"
        color="neutral"
        variant="soft"
        class="w-full"
        aria-label="Search for your site topic"
      />
    </UFormField>
    <div class="border-t border-default xl:flex xl:min-h-32 xl:flex-1 xl:flex-col">
      <p class="px-5 pt-5 pb-2 text-xs text-muted">
        {{ topicSearch ? 'Matching topics' : 'Popular topics' }}
      </p>
      <div
        class="topic-list max-h-[50dvh] overflow-y-auto pb-3 xl:min-h-0 xl:max-h-none xl:flex-1"
        role="region"
        aria-label="Website topics"
        tabindex="0"
      >
        <UButton
          v-for="topic in visibleTopics"
          :key="topic"
          :label="topic"
          color="neutral"
          :variant="model === topic ? 'soft' : 'ghost'"
          :trailing-icon="model === topic ? 'i-lucide-check' : undefined"
          :aria-pressed="model === topic"
          class="flex w-full justify-between rounded-none px-5 py-2.5 text-left text-base font-normal"
          :disabled="disabled"
          @click="model = topic"
        />
        <UButton
          v-if="customTopic && !topics.some(topic => topic.toLowerCase() === customTopic.toLowerCase())"
          :label="`Use “${customTopic}”`"
          color="neutral"
          variant="ghost"
          class="w-full justify-start rounded-none px-5 py-3 text-left"
          :disabled="disabled"
          @click="model = customTopic"
        />
      </div>
    </div>
    <p v-if="model" class="flex items-center gap-2 text-sm text-highlighted" role="status">
      <UIcon name="i-lucide-check" class="size-4" />{{ model }}
    </p>
  </div>
</template>

<style scoped>
.topic-list {
  scrollbar-gutter: stable;
}
.topic-list::-webkit-scrollbar {
  width: 8px;
}
.topic-list::-webkit-scrollbar-track {
  background: var(--ui-bg-muted);
}
.topic-list::-webkit-scrollbar-thumb {
  background: var(--ui-text-dimmed);
  border-radius: 4px;
}
</style>
