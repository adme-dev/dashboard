import type { SlideEdit } from '~/utils/banner-slides'

/** Shared commands for the sidebar and timeline; scene selection is transport-only. */
export function useBannerSlides() {
  const { state, activeSlides, currentSlide, changeSlides, selectLayer } = useBannerStudio()
  const { pauseTimeline, seekTo } = useBannerTimeline()
  const toast = useToast()
  function selectSlide(index: number) {
    const slide = activeSlides.value[index]
    if (!slide) return
    pauseTimeline()
    selectLayer(null)
    // Show an editable poster after the first entrance, rather than an empty first frame.
    seekTo(slide.start + Math.min(1, slide.duration / 2))
  }
  function apply(edit: SlideEdit, selectIndex?: number): boolean {
    pauseTimeline()
    try {
      changeSlides(edit)
      if (selectIndex !== undefined) selectSlide(selectIndex)
      else seekTo(Math.min(state.currentTime, activeSlides.value.at(-1)?.end || 0))
      return true
    } catch (error) {
      toast.add({ title: 'Slide change not saved', description: error instanceof Error ? error.message : 'Please try again.', color: 'error' })
      return false
    }
  }
  function addSlide(after: number) {
    return apply({ type: 'add', after, id: crypto.randomUUID() }, after + 1)
  }
  function duplicateSlide(index: number) {
    return apply({ type: 'duplicate', index, id: crypto.randomUUID() }, index + 1)
  }
  function moveSlide(index: number, to: number) {
    return apply({ type: 'move', index, to }, to)
  }
  return { state, slides: activeSlides, currentSlide, selectSlide, apply, addSlide, duplicateSlide, moveSlide }
}
