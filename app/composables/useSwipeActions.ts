import type { Ref } from 'vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'

export interface SwipeAction {
  id: string
  label: string
  icon: string
  color: 'primary' | 'success' | 'warning' | 'error' | 'neutral'
  action: () => void
}

export interface UseSwipeActionsOptions {
  threshold?: number // Minimum distance to trigger action (px)
  velocityThreshold?: number // Minimum velocity to trigger
  leftActions?: SwipeAction[]
  rightActions?: SwipeAction[]
  onSwipeStart?: () => void
  onSwipeEnd?: () => void
}

export function useSwipeActions(
  elementRef: Ref<HTMLElement | null>,
  options: UseSwipeActionsOptions = {}
) {
  const {
    threshold = 80,
    velocityThreshold = 0.5,
    leftActions = [],
    rightActions = [],
    onSwipeStart,
    onSwipeEnd
  } = options

  const isSwiping = ref(false)
  const swipeDirection = ref<'left' | 'right' | null>(null)
  const swipeDistance = ref(0)
  const activeActionIndex = ref(-1)

  let startX = 0
  let startY = 0
  let startTime = 0
  let isHorizontalSwipe = false

  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    startX = touch.clientX
    startY = touch.clientY
    startTime = Date.now()
    isHorizontalSwipe = false
    isSwiping.value = false
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (!elementRef.value) return

    const touch = e.touches[0]
    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY

    // Determine if this is a horizontal swipe (first significant move)
    if (!isHorizontalSwipe && !isSwiping.value) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY)
        if (isHorizontalSwipe) {
          isSwiping.value = true
          onSwipeStart?.()
        }
      }
    }

    if (!isHorizontalSwipe) return

    // Prevent vertical scroll when swiping horizontally
    e.preventDefault()

    // Determine direction and relevant actions
    // Swiping RIGHT reveals LEFT actions (card moves right, reveals left side)
    // Swiping LEFT reveals RIGHT actions (card moves left, reveals right side)
    const direction = deltaX > 0 ? 'right' : 'left'
    const actions = direction === 'right' ? leftActions : rightActions

    if (actions.length === 0) {
      swipeDistance.value = 0
      return
    }

    swipeDirection.value = direction
    swipeDistance.value = Math.abs(deltaX)

    // Calculate which action is active based on distance
    const actionWidth = threshold
    const activeIndex = Math.min(
      actions.length - 1,
      Math.floor(swipeDistance.value / actionWidth)
    )
    activeActionIndex.value = swipeDistance.value >= threshold ? activeIndex : -1
  }

  const handleTouchEnd = (e: TouchEvent) => {
    if (!isSwiping.value) return

    const deltaTime = Date.now() - startTime
    const velocity = swipeDistance.value / deltaTime

    // Check if swipe should trigger action
    const shouldTrigger = swipeDistance.value >= threshold || velocity > velocityThreshold
    const actions = swipeDirection.value === 'right' ? leftActions : rightActions

    if (shouldTrigger && activeActionIndex.value >= 0 && actions[activeActionIndex.value]) {
      actions[activeActionIndex.value].action()
    }

    // Reset state
    isSwiping.value = false
    swipeDirection.value = null
    swipeDistance.value = 0
    activeActionIndex.value = -1
    onSwipeEnd?.()
  }

  const handleTouchCancel = () => {
    isSwiping.value = false
    swipeDirection.value = null
    swipeDistance.value = 0
    activeActionIndex.value = -1
    onSwipeEnd?.()
  }

  onMounted(() => {
    const el = elementRef.value
    if (!el) return

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true })
  })

  onUnmounted(() => {
    const el = elementRef.value
    if (!el) return

    el.removeEventListener('touchstart', handleTouchStart)
    el.removeEventListener('touchmove', handleTouchMove)
    el.removeEventListener('touchend', handleTouchEnd)
    el.removeEventListener('touchcancel', handleTouchCancel)
  })

  const getTransformStyle = computed(() => {
    if (!isSwiping.value) return {}

    const direction = swipeDirection.value === 'left' ? -1 : 1
    const maxDistance = threshold * 2
    const clampedDistance = Math.min(swipeDistance.value, maxDistance)

    return {
      transform: `translateX(${direction * clampedDistance}px)`,
      transition: 'none'
    }
  })

  const getActionStyle = computed(() => {
    if (!isSwiping.value) return {}

    return {
      opacity: Math.min(1, swipeDistance.value / threshold),
      transform: `scale(${Math.min(1, 0.5 + swipeDistance.value / (threshold * 2))})`
    }
  })

  return {
    isSwiping,
    swipeDirection,
    swipeDistance,
    activeActionIndex,
    getTransformStyle,
    getActionStyle,
    leftActions,
    rightActions
  }
}
