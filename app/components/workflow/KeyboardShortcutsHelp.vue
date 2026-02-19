<script setup lang="ts">
import type { KeyboardShortcut } from '~/composables/useKeyboardShortcuts'

const props = defineProps<{
  shortcuts: KeyboardShortcut[]
  formatShortcut: (shortcut: KeyboardShortcut) => string
}>()

const open = defineModel<boolean>('open', { default: false })

// Group shortcuts by category
const groupedShortcuts = computed(() => {
  const navigation = props.shortcuts.filter(s =>
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(s.key)
  )
  const views = props.shortcuts.filter(s =>
    ['k', 't', 'c', 'g'].includes(s.key)
  )
  const actions = props.shortcuts.filter(s =>
    ['n', '/', 'r'].includes(s.key)
  )
  const priority = props.shortcuts.filter(s =>
    ['1', '2', '3', '4'].includes(s.key)
  )

  return [
    { title: 'Navigation', shortcuts: navigation },
    { title: 'Views', shortcuts: views },
    { title: 'Actions', shortcuts: actions },
    { title: 'Priority', shortcuts: priority }
  ].filter(g => g.shortcuts.length > 0)
})
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <UCard class="w-full max-w-lg">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-keyboard" class="w-5 h-5" />
              <h3 class="text-lg font-semibold">Keyboard Shortcuts</h3>
            </div>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="sm"
              aria-label="Close keyboard shortcuts help"
              @click="open = false"
            />
          </div>
        </template>

        <div class="space-y-6">
          <div
            v-for="group in groupedShortcuts"
            :key="group.title"
          >
            <h4 class="text-sm font-medium text-muted mb-2">{{ group.title }}</h4>
            <div class="space-y-1">
              <div
                v-for="shortcut in group.shortcuts"
                :key="shortcut.key"
                class="flex items-center justify-between py-1.5"
              >
                <span class="text-sm">{{ shortcut.description }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-muted/50 rounded border border-default">
                  {{ formatShortcut(shortcut) }}
                </kbd>
              </div>
            </div>
          </div>

          <div class="pt-4 border-t border-default">
            <p class="text-xs text-muted text-center">
              Press <kbd class="px-1.5 py-0.5 text-xs font-mono bg-muted/50 rounded border border-default">?</kbd> to toggle this help
            </p>
          </div>
        </div>
      </UCard>
    </template>
  </UModal>
</template>
