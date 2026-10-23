import { ref } from 'vue'

const inspectorTab = ref('background')
export function useBannerInspector() {
  const { selectLayer } = useBannerStudio()
  function openEffects(id: number) {
    selectLayer(id)
    inspectorTab.value = 'effects'
  }
  return { inspectorTab, openEffects }
}
