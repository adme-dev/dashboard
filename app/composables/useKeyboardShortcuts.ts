import type { Ref } from 'vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  description: string
  action: () => void
}

export interface UseKeyboardShortcutsOptions {
  enabled?: Ref<boolean> | boolean
  preventDefault?: boolean
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true, preventDefault = true } = options
  const isEnabled = computed(() => typeof enabled === 'boolean' ? enabled : enabled.value)
  const showHelp = ref(false)

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isEnabled.value) return

    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Allow Escape to work in inputs
      if (event.key !== 'Escape') return
    }

    for (const shortcut of shortcuts) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
      const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey)
      const shiftMatch = !!shortcut.shift === event.shiftKey
      const altMatch = !!shortcut.alt === event.altKey

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        if (preventDefault) {
          event.preventDefault()
        }
        shortcut.action()
        return
      }
    }

    // Show help on ? key
    if (event.key === '?' && event.shiftKey) {
      event.preventDefault()
      showHelp.value = !showHelp.value
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  const formatShortcut = (shortcut: KeyboardShortcut): string => {
    const parts: string[] = []
    if (shortcut.ctrl) parts.push('Ctrl')
    if (shortcut.alt) parts.push('Alt')
    if (shortcut.shift) parts.push('Shift')
    if (shortcut.meta) parts.push('⌘')
    parts.push(shortcut.key.toUpperCase())
    return parts.join(' + ')
  }

  return {
    showHelp,
    shortcuts,
    formatShortcut
  }
}

// Workflow board specific shortcuts
export function useWorkflowKeyboardShortcuts(options: {
  onNewTask: () => void
  onSearch: () => void
  onNavigateUp: () => void
  onNavigateDown: () => void
  onNavigateLeft: () => void
  onNavigateRight: () => void
  onOpenTask: () => void
  onCloseModal: () => void
  onToggleView: (view: string) => void
  onRefresh: () => void
  setPriority?: (priority: string) => void
}) {
  const selectedTaskIndex = ref(-1)
  const selectedColumnIndex = ref(0)

  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'n',
      description: 'Create new task',
      action: options.onNewTask
    },
    {
      key: '/',
      description: 'Focus search',
      action: options.onSearch
    },
    {
      key: 'ArrowUp',
      description: 'Navigate up',
      action: () => {
        selectedTaskIndex.value = Math.max(0, selectedTaskIndex.value - 1)
        options.onNavigateUp()
      }
    },
    {
      key: 'ArrowDown',
      description: 'Navigate down',
      action: () => {
        selectedTaskIndex.value++
        options.onNavigateDown()
      }
    },
    {
      key: 'ArrowLeft',
      description: 'Navigate to previous column',
      action: () => {
        selectedColumnIndex.value = Math.max(0, selectedColumnIndex.value - 1)
        options.onNavigateLeft()
      }
    },
    {
      key: 'ArrowRight',
      description: 'Navigate to next column',
      action: () => {
        selectedColumnIndex.value++
        options.onNavigateRight()
      }
    },
    {
      key: 'Enter',
      description: 'Open selected task',
      action: options.onOpenTask
    },
    {
      key: 'Escape',
      description: 'Close modal / deselect',
      action: options.onCloseModal
    },
    {
      key: 'k',
      description: 'Switch to Kanban view',
      action: () => options.onToggleView('kanban')
    },
    {
      key: 't',
      description: 'Switch to Table view',
      action: () => options.onToggleView('table')
    },
    {
      key: 'c',
      description: 'Switch to Calendar view',
      action: () => options.onToggleView('calendar')
    },
    {
      key: 'g',
      description: 'Switch to Timeline/Gantt view',
      action: () => options.onToggleView('timeline')
    },
    {
      key: 'r',
      description: 'Refresh board',
      action: options.onRefresh
    },
    // Priority shortcuts (1-4)
    ...(options.setPriority ? [
      {
        key: '1',
        description: 'Set priority to Urgent',
        action: () => options.setPriority!('urgent')
      },
      {
        key: '2',
        description: 'Set priority to High',
        action: () => options.setPriority!('high')
      },
      {
        key: '3',
        description: 'Set priority to Medium',
        action: () => options.setPriority!('medium')
      },
      {
        key: '4',
        description: 'Set priority to Low',
        action: () => options.setPriority!('low')
      }
    ] : [])
  ]

  return {
    ...useKeyboardShortcuts(shortcuts),
    selectedTaskIndex,
    selectedColumnIndex
  }
}
