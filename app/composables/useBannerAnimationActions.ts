import type { BannerAnimationTarget } from './useBannerStudio'

/** Shared by both context menus and the keyboard-accessible inspector actions. */
export function useBannerAnimationActions() {
  const studio = useBannerStudio()
  const { openAnimation } = useBannerInspector()

  function addTween(target: BannerAnimationTarget | null) {
    const layer = studio.resolveAnimationTarget(target)
    if (!layer || !studio.addMotionPathTween(layer.id)) return false
    openAnimation(target)
    return true
  }

  function menuItems(target: BannerAnimationTarget | null, close: () => void) {
    const layer = studio.resolveAnimationTarget(target)
    if (!layer) return []
    return [
      { label: 'Animate', icon: 'i-lucide-clapperboard', onSelect: () => {
        openAnimation(target)
        close()
      } },
      { label: 'Add Tween', icon: 'i-lucide-spline', disabled: !studio.canAddMotionPathTween(layer), onSelect: () => {
        addTween(target)
        close()
      } }
    ]
  }

  return { captureTarget: studio.captureAnimationTarget, menuItems, animate: openAnimation, addTween }
}
