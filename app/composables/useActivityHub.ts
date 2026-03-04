import { useLocalStorage } from '@vueuse/core'

export type ActivityHubTab = 'feed' | 'for-you' | 'incoming' | 'ai'

const _isOpen = ref(false)
const _hidden = ref(false)

export function useActivityHub() {
  const isOpen = _isOpen
  const hidden = _hidden
  const activeTab = useLocalStorage<ActivityHubTab>('activity-hub-tab', 'for-you')
  const sizeMode = useLocalStorage<'compact' | 'expanded'>('activity-hub-size', 'compact')
  const savedPosition = useLocalStorage('activity-hub-position', { x: -1, y: -1 })

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
    totalUnreadBadge,
    toggle,
    open,
    close,
    minimize,
    toggleSize,
  }
}
