<!-- app/components/email/builder/EdmFlyhubBuilder.client.vue -->
<!-- Editor shell + canvas (2a-ii-2). Block settings panel (2a-ii-3) and
     preview/HTML/save/undo toolbar (2a-ii-4) land in later phases. -->
<script setup lang="ts">
import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'

const store = useEdmBuilder()
const layout = computed(() => store.getLayoutSettings())

const childBlocks = computed(() => {
  const root = store.document.value.root
  const childrenIds = root?.data?.childrenIds || []
  return childrenIds.map(id => ({
    id,
    type: store.document.value[id]?.type || 'Unknown',
    data: store.document.value[id]?.data || {}
  }))
})

function addBlock(type: string, position?: number) {
  store.addBlock(type, 'root', position, getDefaultBlockData(type))
}

function moveBlock(blockId: string, direction: 'up' | 'down') {
  const root = store.document.value.root
  const childrenIds = [...(root?.data?.childrenIds || [])]
  const index = childrenIds.indexOf(blockId)
  if (index === -1) return
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= childrenIds.length) return
  ;[childrenIds[index], childrenIds[newIndex]] = [childrenIds[newIndex], childrenIds[index]]
  store.updateBlockData('root', { childrenIds })
}

function updateLayout(patch: Record<string, unknown>) {
  store.updateLayoutSettings(patch)
}
</script>

<template>
  <div class="flex h-full">
    <!-- Left: block palette -->
    <aside class="w-56 border-r border-default p-3 overflow-auto">
      <p class="text-xs font-semibold uppercase text-muted mb-3">
        Add blocks
      </p>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="blockType in BLOCK_PALETTE"
          :key="blockType.type"
          class="flex flex-col items-center justify-center p-3 rounded-md border border-default bg-elevated/50 text-default cursor-pointer transition-all hover:border-primary hover:bg-primary/10"
          @click="addBlock(blockType.type)"
        >
          <UIcon :name="blockType.icon" class="h-5 w-5 mb-1" />
          <span class="text-xs">{{ blockType.name }}</span>
        </button>
      </div>
    </aside>

    <!-- Center: canvas -->
    <main
      class="flex-1 p-6 overflow-auto"
      :style="{ backgroundColor: layout.backdropColor }"
      @click="store.clearSelection()"
    >
      <div
        class="mx-auto max-w-[600px] min-h-64 rounded shadow-sm"
        :style="{ backgroundColor: layout.canvasColor, color: layout.textColor }"
        @click.stop
      >
        <!-- Empty state -->
        <div
          v-if="childBlocks.length === 0"
          class="flex flex-col items-center justify-center py-20 text-center"
        >
          <UIcon name="i-lucide-plus" class="h-12 w-12 text-muted/50 mb-4" />
          <p class="text-muted">
            Click a block from the sidebar to add it here
          </p>
        </div>

        <!-- Block list -->
        <template v-for="(block, index) in childBlocks" :key="block.id">
          <EmailBuilderEditorBlockWrapper
            :block-id="block.id"
            @move-up="moveBlock(block.id, 'up')"
            @move-down="moveBlock(block.id, 'down')"
            @duplicate="store.duplicateBlock(block.id)"
            @delete="store.removeBlock(block.id)"
            @insert-above="addBlock($event, index)"
            @insert-below="addBlock($event, index + 1)"
          >
            <EmailBuilderContainerBlockRenderer
              v-if="block.type === 'Container'"
              :block-id="block.id"
              :style="block.data?.style"
              :props="block.data?.props"
            />
            <EmailBuilderColumnsContainerRenderer
              v-else-if="block.type === 'ColumnsContainer'"
              :block-id="block.id"
              :style="block.data?.style"
              :props="block.data?.props"
            />
            <EmailBuilderEdmBlockRenderer
              v-else
              :type="block.type"
              :style="block.data?.style"
              :props="block.data?.props"
            />
          </EmailBuilderEditorBlockWrapper>
        </template>

        <!-- Add at end -->
        <div v-if="childBlocks.length > 0" class="flex justify-center py-3">
          <UPopover :content="{ side: 'bottom', align: 'center' }">
            <UButton
              icon="i-lucide-plus"
              variant="soft"
              color="primary"
              size="sm"
              label="Add block"
            />
            <template #content>
              <div class="grid grid-cols-4 gap-1 p-2 w-64">
                <button
                  v-for="blockType in BLOCK_PALETTE"
                  :key="blockType.type"
                  class="flex flex-col items-center justify-center gap-1 p-2 rounded-md cursor-pointer hover:bg-muted min-w-14"
                  @click="addBlock(blockType.type)"
                >
                  <UIcon :name="blockType.icon" class="h-4 w-4" />
                  <span class="text-[10px]">{{ blockType.name }}</span>
                </button>
              </div>
            </template>
          </UPopover>
        </div>
      </div>
    </main>

    <!-- Right: email settings -->
    <aside class="w-80 border-l border-default p-3 overflow-auto">
      <p class="text-xs font-semibold uppercase text-muted mb-3">
        Email settings
      </p>
      <EmailBuilderEmailLayoutSettings :settings="layout" @update="updateLayout" />
    </aside>
  </div>
</template>
