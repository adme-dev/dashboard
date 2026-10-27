import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BannerProject } from '../../app/types/banner-studio'
import {
  assessBridgeLayers,
  createBridgeSidecar,
  planBridgeReturn,
  validateBridgeApply,
  type NativeDocument
} from '../../shared/bannerDocumentBridge'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 1000 })
const { useBannerStudio }
  = await import('../../app/composables/useBannerStudio')
const studio = useBannerStudio()
// Explicit deterministic measurements for unit fixtures; actual native evidence
// is checked separately below and never represented by this stub.
const measureText = async () => ({ left: 0, top: 0, right: 150, bottom: 24 })
let saved: BannerProject
const native = (text: string): NativeDocument => ({
  layers: [
    {
      id: 3,
      content: {
        kind: 'text',
        text,
        runs: [{ len: [...text].length, style: { weight: 700 } }],
        paragraphs: [{ len: [...text].length, style: { align: 'Left' } }]
      }
    }
  ]
})
const projectSnapshot = (): BannerProject =>
  JSON.parse(
    JSON.stringify({
      ...studio.state.project,
      canvasData: studio.getCanvasData()
    })
  )

beforeEach(() => {
  studio.loadProject({
    id: 'local-bridge',
    name: 'Native bridge editor test',
    updatedAt: '2026-10-27T01:00:00.000Z',
    canvasData: {
      mrec: {
        layers: [
          {
            id: 1,
            type: 'text',
            name: 'Heading',
            text: 'Welcome home',
            x: 10,
            y: 10,
            w: 280,
            h: 40,
            zIndex: 2,
            opacity: 1,
            fontFamily: 'Arial',
            fontWeight: 700,
            fontSize: 20,
            color: '#003399',
            animIn: 'none',
            animOut: 'none',
            outDur: 0
          },
          {
            id: 2,
            type: 'text',
            name: 'Approved copy',
            text: 'Offer ends 14 November 2026',
            copyLocked: true,
            x: 10,
            y: 100,
            w: 280,
            h: 40,
            zIndex: 3,
            opacity: 1
          },
          {
            id: 3,
            type: 'image',
            name: 'Map',
            locked: true,
            src: '/local-map.png',
            x: 10,
            y: 150,
            w: 200,
            h: 80,
            zIndex: 1,
            opacity: 1
          }
        ]
      }
    }
  } as BannerProject)
  saved = projectSnapshot()
  vi.stubGlobal(
    '$fetch',
    vi.fn(async (_url, options) => {
      expect(options.body.expectedRevision).toBe(saved.updatedAt)
      saved = {
        ...saved,
        canvasData: options.body.canvasData,
        updatedAt: new Date(Date.parse(saved.updatedAt) + 1000).toISOString()
      }
      return saved
    })
  )
})

describe('document bridge through the native editor store', () => {
  it('applies a reviewed return as one undo action, saves and reopens native text with protected layers exact', async () => {
    const snapshot = projectSnapshot()
    const { sidecar, sidecarHash } = await createBridgeSidecar({
      snapshot,
      revision: 1,
      boardKey: 'mrec',
      size: { width: 300, height: 250 },
      mappings: [{ bannerId: 1, nativeId: 3 }],
      assessment: assessBridgeLayers(snapshot.canvasData.mrec!.layers, [
        { family: 'Arial', weight: 700, italic: false }
      ]),
      nativeBaseline: native('Welcome home')
    })
    const input = {
      sidecar,
      expectedSidecarHash: sidecarHash,
      currentProject: projectSnapshot(),
      currentRevision: 1,
      returned: native('Come celebrate'),
      measureText
    }
    const plan = await planBridgeReturn(input)
    expect(studio.getCanvasData()).toEqual(snapshot.canvasData)
    const validated = await validateBridgeApply(input, plan)
    studio.applyAssistantCanvas(validated.canvasData)
    expect(studio.activeLayers.value[0]!.text).toBe('Come celebrate')
    expect(studio.activeLayers.value.slice(1)).toEqual(
      snapshot.canvasData.mrec!.layers.slice(1)
    )
    studio.undo()
    expect(studio.getCanvasData()).toEqual(snapshot.canvasData)
    expect(studio.canUndo.value).toBe(false)
    studio.redo()
    expect(studio.getCanvasData()).toEqual(validated.canvasData)
    await studio.saveProject()
    studio.loadProject(JSON.parse(JSON.stringify(saved)))
    expect(studio.getCanvasData()).toEqual(validated.canvasData)
    expect(studio.activeLayers.value[0]!.type).toBe('text')
  })

  it('rejects a previously reviewed return after an unrelated native edit, preserving the new editor state', async () => {
    const snapshot = projectSnapshot()
    const { sidecar, sidecarHash } = await createBridgeSidecar({
      snapshot,
      revision: 1,
      boardKey: 'mrec',
      size: { width: 300, height: 250 },
      mappings: [{ bannerId: 1, nativeId: 3 }],
      assessment: assessBridgeLayers(snapshot.canvasData.mrec!.layers, [
        { family: 'Arial', weight: 700, italic: false }
      ]),
      nativeBaseline: native('Welcome home')
    })
    const input = {
      sidecar,
      expectedSidecarHash: sidecarHash,
      currentProject: snapshot,
      currentRevision: 1,
      returned: native('Come celebrate'),
      measureText
    }
    const plan = await planBridgeReturn(input)
    studio.updateLayer(1, { color: '#225599' })
    const current = studio.getCanvasData()
    await expect(
      validateBridgeApply(
        { ...input, currentProject: projectSnapshot() },
        plan
      )
    ).rejects.toThrow('Stale')
    expect(studio.getCanvasData()).toEqual(current)
  })

  it.skipIf(!process.env.BANNER_BRIDGE_PROOF_ROOT)(
    'applies the actual installed PhotoCraft return through editor undo, save and reopen',
    async () => {
      const root = process.env.BANNER_BRIDGE_PROOF_ROOT!
      const read = (name: string) =>
        JSON.parse(readFileSync(join(root, name), 'utf8'))
      const source = read('bridge-source-project.json')
      const sidecar = read('lifestyle-sidecar.json')
      const binding = read('lifestyle-binding.json')
      const returned = read('lifestyle-return-document.json')
      const plan = read('lifestyle-plan.json')
      const input = {
        sidecar,
        expectedSidecarHash: binding.sidecarHash,
        currentProject: source,
        currentRevision: binding.revision,
        returned,
        // Replay locally recorded native measurements only for the exact bound
        // proof wording. This is artifact validation, not a production measurer.
        measureText: async (layer: { id: number }, text: string) => {
          const change = plan.changes.find(
            (c: { layerId: number, after: string }) =>
              c.layerId === layer.id && c.after === text
          )
          expect(change).toBeDefined()
          const fit = plan.textFit.find(
            (f: { layerId: number }) => f.layerId === layer.id
          )
          expect(fit).toBeDefined()
          return fit.bounds
        }
      }
      const validated = await validateBridgeApply(input, plan)
      studio.loadProject(source)
      saved = projectSnapshot()
      const before = studio.getCanvasData()
      studio.applyAssistantCanvas(validated.canvasData)
      const after = studio.getCanvasData()
      const key = sidecar.boardKey
      expect(after[key]!.layers.filter(l => l.id !== 125)).toEqual(
        before[key]!.layers.filter(l => l.id !== 125)
      )
      expect(after[key]!.layers.find(l => l.id === 125)!.text).toBe(
        'COME CELEBRATE WITH US'
      )
      studio.undo()
      expect(studio.getCanvasData()).toEqual(before)
      expect(studio.canUndo.value).toBe(false)
      studio.redo()
      expect(studio.getCanvasData()).toEqual(after)
      await studio.saveProject()
      studio.loadProject(JSON.parse(JSON.stringify(saved)))
      expect(studio.getCanvasData()).toEqual(after)
      writeFileSync(
        join(root, 'editor-store-evidence.json'),
        JSON.stringify(
          {
            status: 'passed',
            sidecarHash: binding.sidecarHash,
            sourceHash: binding.sourceHash,
            protectedOriginalLayers: 124,
            oneUndo: true,
            redo: true,
            savedReopened: true,
            limitation:
              'Native document artifacts and real editor store; API persistence is a fixture. No hosted or bridge UI acceptance.'
          },
          null,
          2
        )
      )
    }
  )
})
