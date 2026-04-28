import { useLocalStorage } from '@vueuse/core'

export type ActivityHubTab = 'feed' | 'chat' | 'for-you' | 'incoming' | 'ai'

const _isOpen = ref(false)
const _hidden = ref(false)
// Board scoping for the AI chat tab. When set, the AI chat sends `boardId`
// in every message so server-side searchCodebase scopes to that one repo.
const _scopedBoardId = ref<string | null>(null)
const _scopedBoardLabel = ref<string | null>(null)

export function useActivityHub() {
  const isOpen = _isOpen
  const hidden = _hidden
  const activeTab = useLocalStorage<ActivityHubTab>('activity-hub-tab', 'for-you')
  const sizeMode = useLocalStorage<'compact' | 'expanded'>('activity-hub-size', 'compact')
  const savedPosition = useLocalStorage('activity-hub-position', { x: -1, y: -1 })
  const scopedBoardId = _scopedBoardId
  const scopedBoardLabel = _scopedBoardLabel

  const { unreadCount } = useNotifications()
  const { totalUnreadCount: chatUnreadCount } = useChat()

  const totalUnreadBadge = computed(() => unreadCount.value + chatUnreadCount.value)

  function toggle() {
    isOpen.value = !isOpen.value
  }

  function open(tab?: ActivityHubTab) {
    if (tab) activeTab.value = tab
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  function minimize() {
    close()
  }

  function toggleSize() {
    sizeMode.value = sizeMode.value === 'compact' ? 'expanded' : 'compact'
  }

  function setScope(boardId: string | null, label: string | null = null) {
    _scopedBoardId.value = boardId
    _scopedBoardLabel.value = label
  }

  function clearScope() {
    _scopedBoardId.value = null
    _scopedBoardLabel.value = null
  }

  defineShortcuts({
    '.': () => toggle(),
    'n': () => open('for-you'),
  })

  return {
    isOpen,
    hidden,
    activeTab,
    sizeMode,
    savedPosition,
    scopedBoardId,
    scopedBoardLabel,
    totalUnreadBadge,
    toggle,
    open,
    close,
    minimize,
    toggleSize,
    setScope,
    clearScope,
  }
}
