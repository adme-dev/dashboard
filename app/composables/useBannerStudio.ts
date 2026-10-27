import type { Layer, ArtboardState, BannerProject, UndoAction, BannerBrandKit, AnimInType, AnimOutType, MotionPathPoint, MotionPathTween } from '~/types/banner-studio'
import { FORMATS, TEMPLATES, migrateLayer, DEFAULT_BG, resolveBannerFormat } from '~/utils/banner-constants'
import { brandColor, brandFont, isLogoLayer, isDarkColor } from '~/utils/banner-brand-kit'
import { assertManagedQrTransition } from '~~/shared/bannerQrProtection'

// Module-scope singleton state
let _uid = 1
let projectEpoch = 0
let pendingSave: Promise<void> | null = null

/** A menu action belongs to this exact document, artboard and layer instance. */
export interface BannerAnimationTarget {
  epoch: number
  formatKey: string
  layer: Layer
}

// Animation clipboard (module-scope singleton)
const animClipboard = ref<{
  animIn: AnimInType
  animInDur: number
  ease: string
  startTime: number
  endTime: number
  outDur: number
  animOut: AnimOutType
  animOutEase: string
} | null>(null)

const state = reactive({
  project: null as BannerProject | null,
  sets: {} as Record<string, ArtboardState>,
  setKeys: [] as string[],
  activeKey: '',
  selectedLayerId: null as number | null,
  clipboard: null as Layer | null,
  wsScale: 1,
  isDirty: false,
  isSaving: false,
  accentColor: '#e8c84a',
  bgColor: DEFAULT_BG,
  // Timeline
  isPlaying: false,
  currentTime: 0,
  duration: 5,
  isLooping: false,
  loopIn: null as number | null,
  loopOut: null as number | null,
  playAllActive: false,
  // Grid & snapping
  showGrid: false,
  gridSize: 10,
  snapToGrid: false,
  // Safe zones
  showSafeZones: false,
  activeSafeZone: null as string | null,
  // Tool strip
  activeTool: 'select' as 'select' | 'hand' | 'comment',
  // Keyframe editing (Phase 4b)
  expandedKeyframeLayers: new Set<number>() as Set<number>,
  selectedKeyframe: null as { layerId: number; property: string; index: number } | null,
  // Motion path tween selection (shared by timeline lane, canvas waypoints and inspector)
  selectedTween: null as { layerId: number; tweenIndex: number } | null,
  // Motion path solo preview — plays only the path tween at full opacity
  soloMotionPath: false,
})

// Undo/redo stacks
const undoStack = ref<UndoAction[]>([])
const redoStack = ref<UndoAction[]>([])

function pushUndo(action: UndoAction) {
  undoStack.value.push({ ...action, formatKey: state.activeKey })
  if (undoStack.value.length > 50) undoStack.value.shift()
  redoStack.value = []
  state.isDirty = true
}

export function useBannerStudio() {
  // ── Computed ──────────────────────────
  const activeLayers = computed(() => {
    return state.sets[state.activeKey]?.layers ?? []
  })

  const activeFormat = computed(() => {
    return FORMATS[state.activeKey] || null
  })

  const selectedLayer = computed(() => {
    if (!state.selectedLayerId) return null
    return activeLayers.value.find(l => l.id === state.selectedLayerId) || null
  })

  const allFormats = computed(() => {
    return state.setKeys.map(k => ({ key: k, ...FORMATS[k] })).filter(f => f.w)
  })

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  // ── Layer operations ──────────────────

  function nextId(): number {
    return _uid++
  }

  function addLayer(partial: Partial<Layer>): Layer {
    const layer = migrateLayer({
      id: nextId(),
      zIndex: activeLayers.value.length ? Math.max(...activeLayers.value.map(l => l.zIndex)) + 1 : 1,
      opacity: 1,
      x: 0,
      y: 0,
      w: 100,
      h: 40,
      ...partial,
    })

    if (!state.sets[state.activeKey]) {
      state.sets[state.activeKey] = { layers: [] }
    }
    state.sets[state.activeKey].layers.push(layer)
    state.selectedLayerId = layer.id
    state.isDirty = true
    pushUndo({ type: 'addLayer', before: null, after: { ...layer } })

    // Broadcast to collaborators
    try { useBannerRealtime().sendLayerAdd(layer, state.activeKey) } catch {}

    return layer
  }

  function removeLayer(id: number) {
    const layers = state.sets[state.activeKey]?.layers
    if (!layers) return
    const idx = layers.findIndex(l => l.id === id)
    if (idx < 0) return
    const removed = layers[idx]
    pushUndo({ type: 'removeLayer', before: { ...removed }, after: null })
    layers.splice(idx, 1)
    if (state.selectedLayerId === id) state.selectedLayerId = null
    state.isDirty = true

    // Broadcast to collaborators
    try { useBannerRealtime().sendLayerRemove(id, state.activeKey) } catch {}
  }

  function duplicateLayer(id: number): Layer | null {
    const source = activeLayers.value.find(l => l.id === id)
    if (!source) return null
    const copy: Layer = {
      ...JSON.parse(JSON.stringify(source)),
      id: nextId(),
      name: source.name + ' copy',
      x: source.x + 12,
      y: source.y + 12,
    }
    // Clear mask relationships on copy — mask behavior shouldn't auto-duplicate
    delete copy.isMask
    delete copy.maskShape
    delete copy.maskTargetIds
    delete copy.maskInvert
    state.sets[state.activeKey].layers.push(copy)
    state.selectedLayerId = copy.id
    state.isDirty = true
    return copy
  }

  function updateLayer(id: number, props: Partial<Layer>) {
    const layer = activeLayers.value.find(l => l.id === id)
    if (!layer) return
    const animationFields = ['motionPath', 'motionPathTweens', 'motionPathCurviness', 'motionPathAutoRotate', 'animIn', 'animOut', 'animInDur', 'outDur', 'ease', 'animOutEase', 'startTime', 'endTime', 'keyframes']
    if (Object.keys(props).some(key => animationFields.includes(key)) && !canEditAnimation(layer)) return
    // Keep managed codes deterministic. Position/box size remain editable; contain
    // fit preserves the SVG's intrinsic ratio. Replace a code through the picker.
    if (layer.platformQr) {
      const editable = new Set(['x', 'y', 'w', 'h', 'name', 'hidden', 'locked', 'zIndex'])
      if (Object.keys(props).some(key => !editable.has(key)
        && JSON.stringify(props[key as keyof Layer]) !== JSON.stringify(layer[key as keyof Layer]))) return
    }
    if (props.maskTargetIds) {
      const managed = new Set(activeLayers.value.filter(l => l.platformQr).map(l => l.id))
      props = { ...props, maskTargetIds: props.maskTargetIds.filter(target => !managed.has(target)) }
    }
    const before = { ...layer }
    let invalidatedLettering = false
    const letteringFields: (keyof Layer)[] = ['text', 'textRuns', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'textShadow', 'textStroke', 'textDepth', 'textTexture', 'gradientColors', 'lineBoxFontSize', 'textAntialias', 'bgColor', 'visualFilter', 'effectOrigin', 'type', 'src']
    if (layer.letteringRecipe && !Object.hasOwn(props, 'letteringRecipe')
      && letteringFields.some(key => Object.hasOwn(props, key) && JSON.stringify(props[key]) !== JSON.stringify(layer[key]))) {
      // Manual typography edits supersede the previous AI proposal. Undo retains it.
      delete layer.letteringRecipe
      invalidatedLettering = true
    }
    Object.assign(layer, props)
    pushUndo({ type: 'updateLayer', before, after: { ...layer } })
    state.isDirty = true

    // Broadcast to collaborators
    try { useBannerRealtime().sendLayerUpdate(id, state.activeKey, invalidatedLettering ? { ...props, letteringRecipe: null } : props) } catch {}
  }

  function reorderLayer(id: number, newZIndex: number) {
    const layer = activeLayers.value.find(l => l.id === id)
    if (!layer) return
    pushUndo({ type: 'reorderLayer', before: { id, zIndex: layer.zIndex }, after: { id, zIndex: newZIndex } })
    layer.zIndex = newZIndex
    state.isDirty = true

    // Broadcast to collaborators
    try { useBannerRealtime().sendLayerReorder(id, state.activeKey, newZIndex) } catch {}
  }

  function bringToFront(id: number) {
    const maxZ = activeLayers.value.length ? Math.max(...activeLayers.value.map(l => l.zIndex)) : 0
    reorderLayer(id, maxZ + 1)
  }

  function sendToBack(id: number) {
    const layer = activeLayers.value.find(l => l.id === id)
    if (!layer) return
    layer.zIndex = 1
    activeLayers.value.filter(l => l.id !== id).forEach((l, i) => {
      l.zIndex = i + 2
    })
    state.isDirty = true
  }

  function selectLayer(id: number | null) {
    if (state.selectedLayerId !== id) resetAnimationSelection()
    state.selectedLayerId = id

    // Broadcast selection (acquires/releases soft lock)
    try { useBannerRealtime().sendLayerSelect(id, state.activeKey) } catch {}
  }

  // ── Artboard operations ───────────────

  function zoomToFitFormat(fmtKey: string, viewport?: { width: number; height: number }, maxScale = 1) {
    const fmt = FORMATS[fmtKey]
    if (typeof window === 'undefined' || !fmt) return
    // Prefer the mounted canvas: sidebars and the timeline can be resized.
    const availW = viewport ? viewport.width - 64 : window.innerWidth - 64 - 256 - 40 - 288
    const availH = viewport ? viewport.height - 104 : window.innerHeight - 64 - 40 - 200
    if (availW <= 0 || availH <= 0) return
    const scale = Math.min(availW / fmt.w, availH / fmt.h) * 0.95
    state.wsScale = Math.max(0.05, Math.min(maxScale, Math.floor(scale * 100) / 100))
  }

  function setActiveArtboard(key: string) {
    if (!state.sets[key]) return
    resetAnimationSelection()
    state.selectedLayerId = null
    state.activeKey = key
    zoomToFitFormat(key)
  }

  function addSizeToSet(key: string) {
    if (state.sets[key]) {
      setActiveArtboard(key)
      return
    }
    // Proportionally scale from active artboard
    const srcFmt = FORMATS[state.activeKey]
    const tgtFmt = FORMATS[key]
    if (!srcFmt || !tgtFmt) return

    const srcLayers = state.sets[state.activeKey]?.layers ?? []
    const idMap = new Map<number, number>()
    const scaled = srcLayers.map(l => {
      const newId = nextId()
      idMap.set(l.id, newId)
      const n: Layer = { ...JSON.parse(JSON.stringify(l)), id: newId }
      const sx = tgtFmt.w / srcFmt.w
      const sy = tgtFmt.h / srcFmt.h
      n.x = Math.round(l.x * sx)
      n.y = Math.round(l.y * sy)
      n.w = Math.round(l.w * sx)
      n.h = Math.round(l.h * sy)
      if (n.type === 'bg') { n.w = tgtFmt.w; n.h = tgtFmt.h }
      if (n.fontSize) n.fontSize = Math.max(7, Math.round(n.fontSize * Math.min(sx, sy)))
      // Scale motion path offsets proportionally
      if (n.motionPath?.length) {
        n.motionPath = n.motionPath.map((pt: MotionPathPoint) => ({
          x: Math.round(pt.x * sx),
          y: Math.round(pt.y * sy),
        }))
      }
      return n
    })
    // Remap mask target IDs
    scaled.forEach(n => {
      if (n.isMask && n.maskTargetIds?.length) {
        n.maskTargetIds = n.maskTargetIds.map(oldId => idMap.get(oldId) ?? oldId)
      }
    })

    state.sets[key] = { layers: scaled }
    state.setKeys.push(key)
    setActiveArtboard(key)
    state.isDirty = true
  }

  /** Add a size with pre-built layers (e.g. from AI smart resize) */
  function addSizeWithLayers(key: string, layers: Partial<Layer>[]) {
    if (state.sets[key]) {
      setActiveArtboard(key)
      return
    }
    const migrated = layers.map(l => migrateLayer({ ...l, id: nextId() }))
    state.sets[key] = { layers: migrated }
    state.setKeys.push(key)
    setActiveArtboard(key)
    state.isDirty = true
  }

  function removeSizeFromSet(key: string) {
    if (state.setKeys.length <= 1) return
    const idx = state.setKeys.indexOf(key)
    if (idx < 0) return
    state.setKeys.splice(idx, 1)
    delete state.sets[key]
    if (state.activeKey === key) {
      state.activeKey = state.setKeys[Math.max(0, idx - 1)]
    }
    state.isDirty = true
  }

  function syncAllFromActive() {
    const srcFmt = FORMATS[state.activeKey]
    const srcLayers = state.sets[state.activeKey]?.layers ?? []

    state.setKeys.forEach(key => {
      if (key === state.activeKey) return
      const tgtFmt = FORMATS[key]
      if (!tgtFmt) return
      const sx = tgtFmt.w / srcFmt.w
      const sy = tgtFmt.h / srcFmt.h
      const idMap = new Map<number, number>()
      const scaled = srcLayers.map(l => {
        const existing = state.sets[key]?.layers?.find(x => x.name === l.name)
        const newId = existing?.id ?? nextId()
        idMap.set(l.id, newId)
        const n: Layer = { ...JSON.parse(JSON.stringify(l)), id: newId }
        n.x = Math.round(l.x * sx)
        n.y = Math.round(l.y * sy)
        n.w = Math.round(l.w * sx)
        n.h = Math.round(l.h * sy)
        if (n.type === 'bg') { n.w = tgtFmt.w; n.h = tgtFmt.h }
        if (n.fontSize) n.fontSize = Math.max(7, Math.round(n.fontSize * Math.min(sx, sy)))
        // Scale motion path offsets proportionally
        if (n.motionPath?.length) {
          n.motionPath = n.motionPath.map((pt: MotionPathPoint) => ({
            x: Math.round(pt.x * sx),
            y: Math.round(pt.y * sy),
          }))
        }
        return n
      })
      // Remap mask target IDs
      scaled.forEach(n => {
        if (n.isMask && n.maskTargetIds?.length) {
          n.maskTargetIds = n.maskTargetIds.map(oldId => idMap.get(oldId) ?? oldId)
        }
      })
      state.sets[key] = { layers: scaled }
    })
    state.isDirty = true
  }

  function loadBannerSet(setDef: { keys: string[]; name: string }) {
    const tpl = TEMPLATES[0]
    state.sets = {}
    state.setKeys = []

    setDef.keys.forEach(key => {
      const fmt = FORMATS[key]
      if (!fmt) return
      const layers = tpl.layers(fmt).map(l => migrateLayer({ ...l, id: nextId() }))
      state.sets[key] = { layers }
      state.setKeys.push(key)
    })

    state.activeKey = setDef.keys[0]
    state.selectedLayerId = null
    zoomToFitFormat(setDef.keys[0])
    state.isDirty = true
  }

  function loadTemplate(templateId: string) {
    const tpl = TEMPLATES.find(t => t.id === templateId)
    if (!tpl) return

    state.setKeys.forEach(key => {
      const fmt = FORMATS[key]
      if (!fmt) return
      state.sets[key] = {
        layers: tpl.layers(fmt).map(l => migrateLayer({ ...l, id: nextId() })),
      }
    })
    state.selectedLayerId = null
    state.isDirty = true
  }

  // ── Background layer operations ──────
  function addBgLayer(): Layer {
    const fmt = activeFormat.value
    const bgLayers = activeLayers.value.filter(l => l.type === 'bg')
    const bgCount = bgLayers.length
    const lastBg = bgLayers.sort((a, b) => (a.startTime || 0) - (b.startTime || 0)).pop()
    const lastEnd = lastBg?.endTime ?? 3

    const layer = addLayer({
      type: 'bg',
      name: `Background ${bgCount + 1}`,
      bgColor: DEFAULT_BG,
      x: 0,
      y: 0,
      w: fmt?.w || 300,
      h: fmt?.h || 250,
      zIndex: 0,
      opacity: 1,
      locked: true,
      animIn: 'fadeIn' as AnimInType,
      animInDur: 0.5,
      startTime: bgCount > 0 ? lastEnd - 0.5 : 0,
      endTime: bgCount > 0 ? lastEnd + 2.5 : 3,
    })

    // Don't auto-select bg layers — keep current selection
    if (bgCount > 0) {
      state.selectedLayerId = null
    }

    return layer
  }

  // ── Animation clipboard ─────────────
  function copyAnimation() {
    const l = selectedLayer.value
    if (!l) return
    animClipboard.value = {
      animIn: l.animIn,
      animInDur: l.animInDur,
      ease: l.ease || 'power2.out',
      startTime: l.startTime,
      endTime: l.endTime,
      outDur: l.outDur || 0.3,
      animOut: l.animOut || 'fadeOut',
      animOutEase: l.animOutEase || 'power1.in',
    }
  }

  function pasteAnimation() {
    const l = selectedLayer.value
    if (!l || !animClipboard.value) return
    updateLayer(l.id, { ...animClipboard.value })
  }

  // ── Clipboard ─────────────────────────

  function copyLayer() {
    if (!state.selectedLayerId) return
    const layer = activeLayers.value.find(l => l.id === state.selectedLayerId)
    if (layer) state.clipboard = JSON.parse(JSON.stringify(layer))
  }

  function cutLayer() {
    copyLayer()
    if (state.selectedLayerId) removeLayer(state.selectedLayerId)
  }

  function pasteLayer() {
    if (!state.clipboard) return
    const pasted = addLayer({
      ...state.clipboard,
      id: undefined as any,
      name: state.clipboard.name + ' paste',
      x: state.clipboard.x + 20,
      y: state.clipboard.y + 20,
    })
    return pasted
  }

  // Undo must remove fields introduced by an edit as well as restore old values.
  function restoreLayerSnapshot(layer: Layer, snapshot: Layer) {
    for (const key of Object.keys(layer) as (keyof Layer)[]) {
      if (!Object.hasOwn(snapshot, key)) delete layer[key]
    }
    Object.assign(layer, snapshot)
  }

  // ── Undo / Redo ───────────────────────

  function undo() {
    const action = undoStack.value.pop()
    if (!action) return
    redoStack.value.push(action)
    state.isDirty = true

    if (action.type === 'assistantCanvas') {
      restoreCanvasData(action.before.canvasData)
      if (state.sets[action.before.activeKey]) state.activeKey = action.before.activeKey
    } else if (action.type === 'addLayer' && action.after) {
      const layers = state.sets[action.formatKey || state.activeKey]?.layers
      if (layers) {
        const idx = layers.findIndex(l => l.id === action.after.id)
        if (idx >= 0) layers.splice(idx, 1)
      }
    } else if (action.type === 'removeLayer' && action.before) {
      state.sets[action.formatKey || state.activeKey]?.layers.push(action.before)
    } else if (action.type === 'updateLayer' && action.before) {
      const layer = state.sets[action.formatKey || state.activeKey]?.layers.find(l => l.id === action.before.id)
      if (layer) restoreLayerSnapshot(layer, action.before)
    } else if (action.type === 'applyBrandKit' && action.before) {
      // Restore all artboard states and global colors
      state.sets = JSON.parse(JSON.stringify(action.before.sets))
      state.accentColor = action.before.accentColor
      state.bgColor = action.before.bgColor
    }
  }

  function redo() {
    const action = redoStack.value.pop()
    if (!action) return
    undoStack.value.push(action)
    state.isDirty = true

    if (action.type === 'assistantCanvas') {
      restoreCanvasData(action.after.canvasData)
      if (state.sets[action.after.activeKey]) state.activeKey = action.after.activeKey
    } else if (action.type === 'addLayer' && action.after) {
      state.sets[action.formatKey || state.activeKey]?.layers.push(action.after)
    } else if (action.type === 'removeLayer' && action.before) {
      const layers = state.sets[action.formatKey || state.activeKey]?.layers
      if (layers) {
        const idx = layers.findIndex(l => l.id === action.before.id)
        if (idx >= 0) layers.splice(idx, 1)
      }
    } else if (action.type === 'updateLayer' && action.after) {
      const layer = state.sets[action.formatKey || state.activeKey]?.layers.find(l => l.id === action.after.id)
      if (layer) restoreLayerSnapshot(layer, action.after)
    } else if (action.type === 'applyBrandKit' && action.after) {
      state.sets = JSON.parse(JSON.stringify(action.after.sets))
      state.accentColor = action.after.accentColor
      state.bgColor = action.after.bgColor
    }
  }

  // ── Project I/O ───────────────────────

  function loadProject(project: BannerProject) {
    projectEpoch++
    resetAnimationSelection()
    undoStack.value = []
    redoStack.value = []
    state.clipboard = null
    animClipboard.value = null
    state.project = project
    state.sets = JSON.parse(JSON.stringify(project.canvasData || {}))
    state.setKeys = Object.keys(state.sets)
    for (const key of state.setKeys) {
      const format = resolveBannerFormat(key)
      if (format) FORMATS[key] = format
    }
    state.activeKey = state.setKeys[0] || ''
    state.wsScale = 1
    zoomToFitFormat(state.activeKey)
    state.selectedLayerId = null
    state.isDirty = false
    // Migrate all layers
    state.setKeys.forEach(key => {
      state.sets[key].layers = state.sets[key].layers.map(l => migrateLayer(l))
    })
    // Reset uid to be higher than any existing layer
    const maxId = state.setKeys.reduce((max, key) => {
      const layerMax = state.sets[key].layers.reduce((m, l) => Math.max(m, l.id), 0)
      return Math.max(max, layerMax)
    }, 0)
    _uid = maxId + 1
  }

  function getCanvasData(): Record<string, ArtboardState> {
    return JSON.parse(JSON.stringify(state.sets))
  }

  function restoreCanvasData(canvasData: Record<string, ArtboardState>) {
    state.sets = JSON.parse(JSON.stringify(canvasData || {}))
    state.setKeys = Object.keys(state.sets)
    for (const key of state.setKeys) {
      const format = resolveBannerFormat(key)
      if (format) FORMATS[key] = format
    }
    state.activeKey = state.setKeys[0] || ''
    state.selectedLayerId = null
    state.isDirty = true
    // Migrate all layers
    state.setKeys.forEach(key => {
      state.sets[key].layers = state.sets[key].layers.map(l => migrateLayer(l))
    })
    // Reset uid
    const maxId = state.setKeys.reduce((max, key) => {
      const layerMax = state.sets[key].layers.reduce((m, l) => Math.max(m, l.id), 0)
      return Math.max(max, layerMax)
    }, 0)
    _uid = maxId + 1
  }

  function applyAssistantCanvas(canvasData: Record<string, ArtboardState>) {
    const before = { canvasData: getCanvasData(), activeKey: state.activeKey }
    assertManagedQrTransition(before.canvasData, canvasData)
    restoreCanvasData(canvasData)
    if (state.sets[before.activeKey]) state.activeKey = before.activeKey
    pushUndo({ type: 'assistantCanvas', before, after: { canvasData: getCanvasData(), activeKey: state.activeKey } })
  }

  /** Treat related layer changes as one reversible canvas edit. */
  function withCanvasUndo(change: () => void) {
    const before = { canvasData: getCanvasData(), activeKey: state.activeKey }
    const previousActions = undoStack.value.slice()
    const previousRedo = redoStack.value.slice()
    const previousSelection = state.selectedLayerId
    const previousDirty = state.isDirty
    try {
      change()
    } catch (error) {
      restoreCanvasData(before.canvasData)
      state.activeKey = before.activeKey
      state.selectedLayerId = previousSelection
      state.isDirty = previousDirty
      undoStack.value = previousActions
      redoStack.value = previousRedo
      throw error
    }
    undoStack.value = previousActions
    pushUndo({ type: 'assistantCanvas', before, after: { canvasData: getCanvasData(), activeKey: state.activeKey } })
  }

  async function saveProject(): Promise<void> {
    // Serialize saves so a slower older request cannot overwrite a newer one.
    if (pendingSave) {
      await pendingSave
      if (state.isDirty) return saveProject()
      return
    }
    if (!state.project?.id) return
    const projectId = state.project.id
    const epoch = projectEpoch
    const name = state.project.name
    const expectedRevision = state.project.updatedAt
    const canvasData = getCanvasData()
    const snapshot = JSON.stringify(canvasData)
    state.isSaving = true
    const operation = (async () => {
      const saved = await $fetch<Partial<BannerProject>>(`/api/agency/banner-studio/projects/${projectId}`, {
        method: 'PATCH', body: { canvasData, name, ...(expectedRevision ? { expectedRevision } : {}) }
      })
      if (epoch === projectEpoch && state.project?.id === projectId) {
        if (saved?.id === projectId && typeof saved.updatedAt === 'string') state.project.updatedAt = saved.updatedAt
        state.isDirty = JSON.stringify(getCanvasData()) !== snapshot || state.project.name !== name
      }
    })()
    pendingSave = operation
    try {
      await operation
    } finally {
      if (pendingSave === operation) pendingSave = null
      state.isSaving = false
    }
  }

  // ── Brand Kit application ─────────────
  /**
   * Apply a brand kit across every artboard. Role-based:
   *   primary   → headline text colour (largest text layer per artboard)
   *   secondary → other text layers
   *   accent    → button backgrounds; button text flips to background/text for contrast
   *   background→ artboard + bg layers
   *   heading font → headlines + buttons; body font → other text
   *   logo      → replaces image layers flagged/named as logo; inserts one top-left if none
   * Fully undoable as a single step.
   */
  function applyBrandKit(kit: BannerBrandKit, opts: { insertLogo?: boolean } = {}) {
    const before = JSON.parse(JSON.stringify(state.sets))
    const beforeAccent = state.accentColor
    const beforeBg = state.bgColor

    const primary = brandColor(kit, 'primary')
    const secondary = brandColor(kit, 'secondary')
    const accent = brandColor(kit, 'accent')
    const background = brandColor(kit, 'background')
    const text = brandColor(kit, 'text')
    const headingFont = brandFont(kit, 'heading')
    const bodyFont = brandFont(kit, 'body')
    const logo = kit.logos.find(l => (isDarkColor(background) ? l.variant !== 'light' : l.variant !== 'dark')) || kit.logos[0]

    if (accent) state.accentColor = accent
    if (background) state.bgColor = background

    state.setKeys.forEach((key) => {
      const artboard = state.sets[key]
      if (!artboard) return
      if (background) artboard.bgColor = background

      const textLayers = artboard.layers.filter(l => l.type === 'text')
      const headline = textLayers.length
        ? textLayers.reduce((a, b) => ((b.fontSize || 0) > (a.fontSize || 0) ? b : a))
        : null

      let logoApplied = false
      artboard.layers.forEach((layer) => {
        if (layer.platformQr) return
        if (layer.type === 'bg' && background) layer.bgColor = background
        if (layer.type === 'text') {
          const isHeadline = layer === headline
          if (isHeadline && primary) layer.color = primary
          else if (!isHeadline && (secondary || text)) layer.color = (secondary || text)!
          const f = isHeadline ? headingFont : bodyFont
          if (f) layer.fontFamily = f.family
        }
        if (layer.type === 'button') {
          if (accent) {
            layer.bgColor = accent
            // keep the label legible against the new accent
            layer.textColor = isDarkColor(accent) ? (background && !isDarkColor(background) ? background : '#ffffff') : (text && isDarkColor(text) ? text : '#111111')
          }
          if (headingFont) layer.fontFamily = headingFont.family
        }
        if (logo && isLogoLayer(layer)) {
          layer.src = logo.url
          layer.isLogo = true
          layer.fit = layer.fit || 'contain'
          logoApplied = true
        }
      })

      if (logo && !logoApplied && opts.insertLogo !== false) {
        const fmt = FORMATS[key]
        const w = fmt ? Math.round(Math.min(fmt.w * 0.3, 160)) : 120
        const h = Math.round(w * 0.4)
        const top = Math.max(...artboard.layers.map(l => l.zIndex), 0) + 1
        artboard.layers.push(migrateLayer({
          id: nextId(),
          type: 'image',
          name: `${kit.name} logo`,
          isLogo: true,
          src: logo.url,
          fit: 'contain',
          x: 12, y: 12, w, h,
          zIndex: top, opacity: 1,
        } as Partial<Layer>))
      }
    })

    state.isDirty = true
    pushUndo({
      type: 'applyBrandKit',
      before: { sets: before, accentColor: beforeAccent, bgColor: beforeBg },
      after: { sets: JSON.parse(JSON.stringify(state.sets)), accentColor: state.accentColor, bgColor: state.bgColor },
    })

    // Make sure the kit's fonts are actually loaded so the canvas re-renders with them
    try {
      const { loadFont } = useBannerFonts()
      for (const f of [headingFont, bodyFont]) if (f) loadFont(f.family, f.weights)
    } catch {}
  }

  // ── Mask operations ─────────────────
  function toggleMask(layerId: number) {
    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!layer) return
    if (layer.isMask) {
      // Disable mask
      updateLayer(layerId, { isMask: undefined, maskShape: undefined, maskTargetIds: undefined, maskInvert: undefined } as any)
    } else {
      // Enable mask — auto-select layers below (lower zIndex, excluding bg/audio/other masks)
      const targets = activeLayers.value
        .filter(l => l.id !== layerId && l.zIndex < layer.zIndex && l.type !== 'bg' && l.type !== 'audio' && !l.isMask)
        .map(l => l.id)
      updateLayer(layerId, { isMask: true, maskShape: 'rect', maskTargetIds: targets, maskInvert: false })
    }
  }

  function setMaskTargets(maskLayerId: number, targetIds: number[]) {
    updateLayer(maskLayerId, { maskTargetIds: targetIds })
  }

  // ── Motion path operations ────────────

  function resetAnimationSelection() {
    state.selectedTween = null
    state.selectedKeyframe = null
    state.soloMotionPath = false
  }

  function canEditAnimation(layer: Layer | null | undefined): layer is Layer {
    if (!layer || !activeLayers.value.includes(layer) || layer.platformQr || layer.locked) return false
    try {
      if (useBannerRealtime().isLayerLockedByOther(layer.id)) return false
    } catch { /* Realtime is optional in offline editors. */ }
    return true
  }

  function canAnimateLayer(layer: Layer | null | undefined): layer is Layer {
    if (!canEditMotionPath(layer) || layer.isMask
      || activeLayers.value.some(mask => mask.isMask && mask.maskTargetIds?.includes(layer.id))) return false
    return true
  }

  function canEditMotionPath(layer: Layer | null | undefined): layer is Layer {
    return canEditAnimation(layer) && ['text', 'image', 'video', 'button', 'rect'].includes(layer.type)
  }

  function captureAnimationTarget(layer: Layer): BannerAnimationTarget | null {
    return canAnimateLayer(layer) ? { epoch: projectEpoch, formatKey: state.activeKey, layer } : null
  }

  function resolveAnimationTarget(target: BannerAnimationTarget | null | undefined): Layer | null {
    if (!target || target.epoch !== projectEpoch || target.formatKey !== state.activeKey) return null
    return canAnimateLayer(target.layer) ? target.layer : null
  }

  function tweenAddition(layer: Layer): { updates: Partial<Layer>, tweenIndex: number } | null {
    // Preserve established inspector editing of existing mask/target paths.
    // Creating a path through the new action retains the narrower eligibility.
    if (!(layer.motionPath?.length ? canEditMotionPath(layer) : canAnimateLayer(layer))) return null
    const start = layer.startTime === undefined ? 0 : layer.startTime
    const end = layer.endTime === undefined ? start + 3 : layer.endTime
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 0.05) return null
    if (!layer.motionPath?.length) {
      // Independent offsets keep native wording, base geometry and keyframes intact.
      const distance = Math.min(100, Math.max(10, (FORMATS[state.activeKey]?.w || 1000) / 10))
      return { updates: {
        motionPath: [{ x: 0, y: 0 }, { x: distance, y: 0 }],
        motionPathCurviness: 1,
        motionPathTweens: [{ startTime: start, endTime: end, pathStart: 0, pathEnd: 1, ease: 'power2.inOut' }]
      }, tweenIndex: 0 }
    }
    const path = layer.motionPath
    if (path.length < 2 || path.some(pt => !Number.isFinite(pt.x) || !Number.isFinite(pt.y))
      || path.every(pt => pt.x === path[0]!.x && pt.y === path[0]!.y)) return null
    const tweens = getMotionPathTweens(layer).map(tw => ({ ...tw }))
    if (tweens.some((tw, index) => ![tw.startTime, tw.endTime, tw.pathStart, tw.pathEnd].every(Number.isFinite)
      || tw.startTime < start || tw.endTime > end || tw.endTime - tw.startTime < 0.05
      || tw.pathStart < 0 || tw.pathStart > 1 || tw.pathEnd < 0 || tw.pathEnd > 1
      || (index > 0 && tw.startTime < tweens[index - 1]!.endTime))) return null
    const last = tweens[tweens.length - 1]!
    if (end - last.endTime >= 0.2 && last.pathEnd !== 1) {
      tweens.push({ startTime: last.endTime, endTime: Math.min(last.endTime + 1, end), pathStart: last.pathEnd, pathEnd: 1, ease: 'power2.inOut' })
    } else {
      const midTime = (last.startTime + last.endTime) / 2
      const midPath = (last.pathStart + last.pathEnd) / 2
      if (midTime - last.startTime < 0.05 || last.endTime - midTime < 0.05 || last.pathStart === last.pathEnd) return null
      tweens[tweens.length - 1] = { ...last, endTime: midTime, pathEnd: midPath }
      tweens.push({ ...last, startTime: midTime, pathStart: midPath })
    }
    return { updates: { motionPathTweens: tweens }, tweenIndex: tweens.length - 1 }
  }

  function canAddMotionPathTween(layer: Layer | null | undefined) {
    return !!layer && !!tweenAddition(layer)
  }

  function toggleMotionPath(layerId: number) {
    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!canEditMotionPath(layer)) return
    if (layer.motionPath?.length) {
      // Disable
      updateLayer(layerId, {
        motionPath: undefined,
        motionPathCurviness: undefined,
        motionPathAutoRotate: undefined,
        motionPathTweens: undefined,
      } as any)
    } else {
      // Enable — convert existing x/y keyframes to path points if available
      let points: MotionPathPoint[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
      if (layer.keyframes?.x?.length && layer.keyframes?.y?.length) {
        const xKfs = [...layer.keyframes.x].sort((a, b) => a.time - b.time)
        const yKfs = [...layer.keyframes.y].sort((a, b) => a.time - b.time)
        // Pair by index (simplest approach)
        const len = Math.min(xKfs.length, yKfs.length)
        points = []
        for (let i = 0; i < len; i++) {
          points.push({ x: xKfs[i].value, y: yKfs[i].value })
        }
        if (points.length < 2) points = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
      }
      updateLayer(layerId, {
        motionPath: points,
        motionPathCurviness: 1,
      })
    }
  }

  function addPathPoint(layerId: number, x: number, y: number, insertIndex?: number) {
    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!layer?.motionPath) return
    const path = [...layer.motionPath]
    const pt: MotionPathPoint = { x, y }
    if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= path.length) {
      path.splice(insertIndex, 0, pt)
    } else {
      // Insert before last point
      path.splice(Math.max(0, path.length - 1), 0, pt)
    }
    updateLayer(layerId, { motionPath: path })
  }

  function updatePathPoint(layerId: number, pointIndex: number, x: number, y: number) {
    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!layer?.motionPath?.[pointIndex]) return
    const path = [...layer.motionPath]
    path[pointIndex] = { x, y }
    updateLayer(layerId, { motionPath: path })
  }

  function removePathPoint(layerId: number, pointIndex: number) {
    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!layer?.motionPath || layer.motionPath.length <= 2) return
    const path = [...layer.motionPath]
    path.splice(pointIndex, 1)
    updateLayer(layerId, { motionPath: path })
  }

  // ── Motion path tween operations ──────

  /** Get resolved tweens — returns existing tweens or a default spanning the full presence */
  function getMotionPathTweens(layer: Layer): MotionPathTween[] {
    if (layer.motionPathTweens?.length) return layer.motionPathTweens
    const start = layer.startTime || 0
    const end = layer.endTime || (start + 3)
    return [{ startTime: start, endTime: end, pathStart: 0, pathEnd: 1, ease: 'power2.inOut' }]
  }

  function addMotionPathTween(layerId: number) {
    const layer = activeLayers.value.find(l => l.id === layerId)
    const addition = layer && tweenAddition(layer)
    if (!addition) return false
    updateLayer(layerId, addition.updates)
    selectLayer(layerId)
    state.selectedTween = { layerId, tweenIndex: addition.tweenIndex }
    return true
  }

  function updateMotionPathTween(layerId: number, tweenIndex: number, updates: Partial<MotionPathTween>) {
    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!layer?.motionPath?.length) return
    const tweens = [...getMotionPathTweens(layer)]
    if (!tweens[tweenIndex]) return
    tweens[tweenIndex] = { ...tweens[tweenIndex], ...updates }
    updateLayer(layerId, { motionPathTweens: tweens } as any)
  }

  function removeMotionPathTween(layerId: number, tweenIndex: number) {
    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!layer?.motionPathTweens || layer.motionPathTweens.length <= 1) return
    const tweens = [...layer.motionPathTweens]
    tweens.splice(tweenIndex, 1)
    updateLayer(layerId, { motionPathTweens: tweens } as any)
  }

  // ── Alignment operations ─────────────
  type AlignDir = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'

  function alignLayers(direction: AlignDir, layerIds?: number[]) {
    const ids = layerIds?.length ? layerIds : (state.selectedLayerId ? [state.selectedLayerId] : [])
    if (!ids.length) return
    const fmt = FORMATS[state.activeKey]
    if (!fmt) return
    const layers = activeLayers.value.filter(l => ids.includes(l.id))

    layers.forEach(l => {
      let props: Partial<Layer> = {}
      switch (direction) {
        case 'left': props = { x: 0 }; break
        case 'center-h': props = { x: Math.round((fmt.w - l.w) / 2) }; break
        case 'right': props = { x: fmt.w - l.w }; break
        case 'top': props = { y: 0 }; break
        case 'center-v': props = { y: Math.round((fmt.h - l.h) / 2) }; break
        case 'bottom': props = { y: fmt.h - l.h }; break
      }
      updateLayer(l.id, props)
    })
  }

  type DistDir = 'horizontal' | 'vertical'

  function distributeLayers(direction: DistDir, layerIds: number[]) {
    if (layerIds.length < 3) return
    const layers = activeLayers.value
      .filter(l => layerIds.includes(l.id))
      .sort((a, b) => direction === 'horizontal' ? a.x - b.x : a.y - b.y)

    if (direction === 'horizontal') {
      const first = layers[0].x
      const last = layers[layers.length - 1].x + layers[layers.length - 1].w
      const totalItemWidth = layers.reduce((sum, l) => sum + l.w, 0)
      const gap = (last - first - totalItemWidth) / (layers.length - 1)
      let cx = first
      layers.forEach(l => {
        updateLayer(l.id, { x: Math.round(cx) })
        cx += l.w + gap
      })
    } else {
      const first = layers[0].y
      const last = layers[layers.length - 1].y + layers[layers.length - 1].h
      const totalItemHeight = layers.reduce((sum, l) => sum + l.h, 0)
      const gap = (last - first - totalItemHeight) / (layers.length - 1)
      let cy = first
      layers.forEach(l => {
        updateLayer(l.id, { y: Math.round(cy) })
        cy += l.h + gap
      })
    }
  }

  type MatchDir = 'width' | 'height' | 'both'

  function matchSize(direction: MatchDir, layerIds: number[]) {
    if (layerIds.length < 2) return
    const source = activeLayers.value.find(l => l.id === layerIds[0])
    if (!source) return
    layerIds.slice(1).forEach(id => {
      const props: Partial<Layer> = {}
      if (direction === 'width' || direction === 'both') props.w = source.w
      if (direction === 'height' || direction === 'both') props.h = source.h
      updateLayer(id, props)
    })
  }

  function initDefault() {
    if (state.setKeys.length > 0) return
    const defaultSet = { keys: ['mrec'], name: 'Default' }
    loadBannerSet(defaultSet)
    // Apply first template
    loadTemplate('automotive')
    state.isDirty = false
    // Auto-zoom to fit the default artboard
    zoomToFitFormat(state.activeKey)
  }

  return {
    state,
    // Computed
    activeLayers,
    activeFormat,
    selectedLayer,
    allFormats,
    canUndo,
    canRedo,
    // Layer ops
    addLayer,
    removeLayer,
    duplicateLayer,
    updateLayer,
    reorderLayer,
    bringToFront,
    sendToBack,
    selectLayer,
    // Artboard ops
    setActiveArtboard,
    zoomToFitFormat,
    addSizeToSet,
    addSizeWithLayers,
    removeSizeFromSet,
    syncAllFromActive,
    loadBannerSet,
    loadTemplate,
    // Background
    addBgLayer,
    // Animation clipboard
    copyAnimation,
    pasteAnimation,
    animClipboard,
    // Clipboard
    copyLayer,
    cutLayer,
    pasteLayer,
    // Undo/Redo
    undo,
    redo,
    // Project I/O
    loadProject,
    getCanvasData,
    restoreCanvasData,
    applyAssistantCanvas,
    withCanvasUndo,
    saveProject,
    initDefault,
    nextId,
    // Brand kit
    applyBrandKit,
    // Alignment
    alignLayers,
    distributeLayers,
    matchSize,
    // Mask
    toggleMask,
    setMaskTargets,
    // Motion path
    canEditAnimation,
    canEditMotionPath,
    canAnimateLayer,
    canAddMotionPathTween,
    captureAnimationTarget,
    resolveAnimationTarget,
    toggleMotionPath,
    addPathPoint,
    updatePathPoint,
    removePathPoint,
    // Motion path tweens
    getMotionPathTweens,
    addMotionPathTween,
    updateMotionPathTween,
    removeMotionPathTween,
  }
}
