<script setup lang="ts">
const { feedsState, activeFeed, setPreviewRow, togglePreview } = useBannerFeeds()

const rowInput = ref('')

watch(() => feedsState.previewRowIndex, (idx) => {
  rowInput.value = String(idx + 1)
}, { immediate: true })

function goToRow() {
  const num = parseInt(rowInput.value)
  if (!isNaN(num) && num >= 1) {
    setPreviewRow(num - 1)
  }
}

function prevRow() {
  if (feedsState.previewRowIndex > 0) {
    setPreviewRow(feedsState.previewRowIndex - 1)
  }
}

function nextRow() {
  if (feedsState.previewRowIndex < feedsState.previewRows.length - 1) {
    setPreviewRow(feedsState.previewRowIndex + 1)
  }
}

const currentRow = computed(() => feedsState.previewRows[feedsState.previewRowIndex] || {})
const previewChips = computed(() => {
  const row = currentRow.value
  return Object.entries(row).slice(0, 3).map(([key, val]) => ({
    key,
    value: String(val).length > 20 ? String(val).slice(0, 20) + '...' : String(val),
  }))
})
</script>

<template>
  <div class="flex items-center gap-3 px-3 py-1.5 bg-(--ui-bg-elevated) border-b border-(--ui-border) shrink-0">
    <UIcon name="i-lucide-database" class="w-4 h-4 text-(--ui-primary) shrink-0" />
    <span class="text-xs font-semibold truncate">{{ activeFeed?.name || 'Feed' }}</span>
    <span class="text-[11px] text-(--ui-text-muted)">
      Row {{ feedsState.previewRowIndex + 1 }} of {{ feedsState.previewRows.length }}
    </span>

    <div class="flex items-center gap-0.5">
      <UButton
        icon="i-lucide-chevron-left"
        variant="ghost"
        size="xs"
        :disabled="feedsState.previewRowIndex <= 0"
        @click="prevRow"
      />
      <input
        v-model="rowInput"
        class="w-10 text-center text-xs bg-(--ui-bg) border border-(--ui-border) rounded px-1 py-0.5"
        @keydown.enter="goToRow"
        @blur="goToRow"
      >
      <UButton
        icon="i-lucide-chevron-right"
        variant="ghost"
        size="xs"
        :disabled="feedsState.previewRowIndex >= feedsState.previewRows.length - 1"
        @click="nextRow"
      />
    </div>

    <!-- Current row summary -->
    <div class="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
      <UBadge
        v-for="chip in previewChips"
        :key="chip.key"
        variant="subtle"
        color="info"
        size="xs"
        class="truncate max-w-[120px]"
      >
        {{ chip.key }}: {{ chip.value }}
      </UBadge>
    </div>

    <UButton
      icon="i-lucide-x"
      label="Exit"
      variant="soft"
      size="xs"
      @click="togglePreview()"
    />
  </div>
</template>
