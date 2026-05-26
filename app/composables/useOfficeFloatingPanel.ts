import { useDraggable, useLocalStorage, useMediaQuery, useWindowSize } from '@vueuse/core'

type OfficeFloatingPanelOptions = {
  storageKey: string
  width?: number
  defaultTop?: number
  margin?: number
}

export function useOfficeFloatingPanel(options: OfficeFloatingPanelOptions) {
  const panelEl = ref<HTMLElement | null>(null)
  const handleEl = ref<HTMLElement | null>(null)
  const hydrated = ref(false)
  const { width: windowWidth, height: windowHeight } = useWindowSize()
  const isFloating = useMediaQuery('(min-width: 640px)')
  const savedPosition = useLocalStorage(options.storageKey, { x: -1, y: -1 })
  const panelWidth = options.width ?? 380
  const defaultTop = options.defaultTop ?? 96
  const margin = options.margin ?? 24

  const defaultPosition = computed(() => ({
    x: Math.max(margin, windowWidth.value - panelWidth - margin),
    y: defaultTop
  }))

  const { x, y, isDragging } = useDraggable(panelEl, {
    handle: handleEl,
    initialValue: { x: 0, y: 0 },
    preventDefault: true
  })

  function clampPosition() {
    if (!isFloating.value) return
    const width = panelEl.value?.offsetWidth || panelWidth
    const height = panelEl.value?.offsetHeight || 420
    const maxX = Math.max(margin, windowWidth.value - width - margin)
    const maxY = Math.max(margin, windowHeight.value - height - margin)
    x.value = Math.max(margin, Math.min(x.value, maxX))
    y.value = Math.max(margin, Math.min(y.value, maxY))
  }

  function applyInitialPosition() {
    if (!isFloating.value) return
    const next = savedPosition.value.x >= 0 && savedPosition.value.y >= 0
      ? savedPosition.value
      : defaultPosition.value
    x.value = next.x
    y.value = next.y
    nextTick(() => {
      clampPosition()
      savedPosition.value = { x: x.value, y: y.value }
    })
  }

  onMounted(() => {
    hydrated.value = true
    applyInitialPosition()
  })

  watch([isFloating, windowWidth, windowHeight], () => {
    if (!hydrated.value) return
    if (isFloating.value) applyInitialPosition()
  })

  watch([x, y], () => {
    if (!hydrated.value || !isFloating.value) return
    clampPosition()
    savedPosition.value = { x: x.value, y: y.value }
  })

  const panelStyle = computed(() => {
    if (!hydrated.value || !isFloating.value) return undefined
    return {
      left: `${x.value}px`,
      top: `${y.value}px`,
      right: 'auto',
      bottom: 'auto'
    }
  })

  return {
    panelEl,
    handleEl,
    isDragging,
    panelStyle
  }
}
