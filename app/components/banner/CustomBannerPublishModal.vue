<script setup lang="ts">
const props = defineProps<{
  open: boolean
  instance: {
    id: string
    name: string
    publishedUrl: string | null
    isPublished: boolean
    width: number | null
    height: number | null
  }
}>()

const emit = defineEmits<{
  'update:open': [val: boolean]
}>()

const toast = useToast()
const loadingTags = ref(false)
const tags = ref<{ type: string; label: string; code: string }[]>([])

watch(() => props.open, async (isOpen) => {
  if (!isOpen || !props.instance.isPublished) return

  loadingTags.value = true
  try {
    const data = await $fetch<{ tags: typeof tags.value }>(
      `/api/agency/banner-studio/custom-instances/${props.instance.id}/tags`,
    )
    tags.value = data.tags
  } catch {
    tags.value = []
  } finally {
    loadingTags.value = false
  }
})

function copyTag(code: string, label: string) {
  navigator.clipboard.writeText(code)
  toast.add({ title: 'Copied', description: `${label} copied to clipboard`, color: 'success' })
}
</script>

<template>
  <UModal :open="open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="p-5">
        <h2 class="text-lg font-semibold mb-4">Published: {{ instance.name }}</h2>

        <div v-if="instance.publishedUrl" class="mb-4">
          <label class="text-sm font-medium text-muted mb-1 block">Published URL</label>
          <div class="flex gap-2">
            <UInput :model-value="instance.publishedUrl" readonly class="flex-1 font-mono text-xs" />
            <UButton
              icon="i-lucide-copy"
              variant="outline"
              size="sm"
              @click="copyTag(instance.publishedUrl!, 'URL')"
            />
            <UButton
              icon="i-lucide-external-link"
              variant="outline"
              size="sm"
              :href="safePublicUrl(instance.publishedUrl)"
              target="_blank"
              tag="a"
            />
          </div>
        </div>

        <div v-if="loadingTags" class="flex items-center justify-center py-6">
          <XfLoader size="sm" />
        </div>

        <div v-else-if="tags.length" class="space-y-4">
          <div v-for="tag in tags" :key="tag.type">
            <div class="flex items-center justify-between mb-1">
              <label class="text-sm font-medium">{{ tag.label }}</label>
              <UButton
                label="Copy"
                icon="i-lucide-copy"
                size="xs"
                variant="soft"
                @click="copyTag(tag.code, tag.label)"
              />
            </div>
            <pre class="bg-elevated border border-default rounded p-3 text-xs font-mono overflow-x-auto max-h-32 whitespace-pre-wrap">{{ tag.code }}</pre>
          </div>
        </div>

        <div class="flex justify-end pt-4 border-t border-default mt-4">
          <UButton label="Close" variant="outline" @click="emit('update:open', false)" />
        </div>
      </div>
    </template>
  </UModal>
</template>
