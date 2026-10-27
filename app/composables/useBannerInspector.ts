import { ref } from 'vue'
import type { BannerAnimationTarget } from './useBannerStudio'

const inspectorTab = ref('background')
export function useBannerInspector() {
  const { selectLayer, resolveAnimationTarget } = useBannerStudio()
  function openEffects(id: number) {
    selectLayer(id)
    inspectorTab.value = 'effects'
  }
  function openAnimation(target: BannerAnimationTarget | null) {
    const layer = resolveAnimationTarget(target)
    if (!layer) return false
    selectLayer(layer.id)
    inspectorTab.value = 'animation'
    return true
  }
  return { inspectorTab, openEffects, openAnimation }
}
