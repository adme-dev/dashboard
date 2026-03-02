import { onKeyDown } from '@vueuse/core'

export function useBannerKeyboard(opts: {
  showExportModal: Ref<boolean>
}) {
  const {
    state,
    activeLayers,
    selectedLayer,
    removeLayer,
    duplicateLayer,
    copyLayer,
    cutLayer,
    pasteLayer,
    copyAnimation,
    pasteAnimation,
    undo,
    redo,
    saveProject,
    bringToFront,
    sendToBack,
    updateLayer,
  } = useBannerStudio()
  const { seekTo } = useBannerTimeline()

  const toast = useToast()

  function jumpToKeyframe(direction: 'next' | 'prev') {
    const times = new Set<number>()
    for (const layer of activeLayers.value) {
      times.add(layer.startTime || 0)
      times.add(layer.endTime || 3)
      if (layer.keyframes) {
        for (const kfs of Object.values(layer.keyframes)) {
          if (!kfs) continue
          for (const kf of kfs) times.add(kf.time)
        }
      }
    }
    const sorted = [...times].sort((a, b) => a - b)
    const cur = state.currentTime
    if (direction === 'next') {
      const next = sorted.find(t => t > cur + 0.001)
      if (next !== undefined) seekTo(next)
    } else {
      const prev = [...sorted].reverse().find(t => t < cur - 0.001)
      if (prev !== undefined) seekTo(prev)
    }
  }

  onKeyDown(true, (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    // Ignore when typing in input fields
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

    const mod = e.metaKey || e.ctrlKey

    // Tool switching (single-key, no modifiers)
    if (!mod && !e.shiftKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'v':
          e.preventDefault()
          state.activeTool = 'select'
          return
        case 'h':
          e.preventDefault()
          state.activeTool = 'hand'
          return
        case 'm':
          e.preventDefault()
          state.activeTool = state.activeTool === 'comment' ? 'select' : 'comment'
          return
      }
    }

    // Alt+. → Jump to next keyframe
    if (e.altKey && e.key === '.') {
      e.preventDefault()
      jumpToKeyframe('next')
      return
    }
    // Alt+, → Jump to previous keyframe
    if (e.altKey && e.key === ',') {
      e.preventDefault()
      jumpToKeyframe('prev')
      return
    }

    // Delete/Backspace — delete selected layer
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedLayerId) {
      e.preventDefault()
      removeLayer(state.selectedLayerId)
      return
    }

    // Ctrl/Cmd+Shift+C — copy animation
    if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      copyAnimation()
      return
    }

    // Ctrl/Cmd+Shift+V — paste animation
    if (mod && e.shiftKey && e.key.toLowerCase() === 'v') {
      e.preventDefault()
      pasteAnimation()
      return
    }

    // Ctrl/Cmd+C — copy
    if (mod && e.key === 'c') {
      e.preventDefault()
      copyLayer()
      return
    }

    // Ctrl/Cmd+V — paste
    if (mod && e.key === 'v') {
      e.preventDefault()
      pasteLayer()
      return
    }

    // Ctrl/Cmd+X — cut
    if (mod && e.key === 'x') {
      e.preventDefault()
      cutLayer()
      return
    }

    // Ctrl/Cmd+D — duplicate
    if (mod && e.key === 'd') {
      e.preventDefault()
      if (state.selectedLayerId) duplicateLayer(state.selectedLayerId)
      return
    }

    // Ctrl/Cmd+Z — undo
    if (mod && !e.shiftKey && e.key === 'z') {
      e.preventDefault()
      undo()
      return
    }

    // Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y — redo
    if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key === 'y')) {
      e.preventDefault()
      redo()
      return
    }

    // Ctrl/Cmd+S — save
    if (mod && e.key === 's') {
      e.preventDefault()
      saveProject().then(() => {
        toast.add({ title: 'Saved', color: 'success' })
      }).catch(() => {
        toast.add({ title: 'Save failed', color: 'error' })
      })
      return
    }

    // Ctrl/Cmd+E — export
    if (mod && e.key === 'e') {
      e.preventDefault()
      opts.showExportModal.value = true
      return
    }

    // Space — play/pause
    if (e.key === ' ') {
      e.preventDefault()
      state.isPlaying = !state.isPlaying
      return
    }

    // Arrow keys — nudge selected layer
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && state.selectedLayerId && selectedLayer.value) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const props: Partial<{ x: number; y: number }> = {}
      if (e.key === 'ArrowUp') props.y = selectedLayer.value.y - step
      if (e.key === 'ArrowDown') props.y = selectedLayer.value.y + step
      if (e.key === 'ArrowLeft') props.x = selectedLayer.value.x - step
      if (e.key === 'ArrowRight') props.x = selectedLayer.value.x + step
      updateLayer(state.selectedLayerId, props)
      return
    }

    // [ — send to back
    if (e.key === '[' && state.selectedLayerId) {
      e.preventDefault()
      sendToBack(state.selectedLayerId)
      return
    }

    // ] — bring to front
    if (e.key === ']' && state.selectedLayerId) {
      e.preventDefault()
      bringToFront(state.selectedLayerId)
      return
    }
  })
}
