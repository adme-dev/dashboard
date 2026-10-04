import { describe, expect, it } from 'vitest'
import { applyDesignProposal, designAssistRequestSchema, validateDesignCanvas, designCanvasDimensions, DESIGN_FORMAT_DIMENSIONS, type DesignCanvas } from '../../server/utils/banner/designAssistant'

import { FORMATS, TEMPLATES, migrateLayer } from '../../app/utils/banner-constants'

const asset = 'https://assets.example.com/client/image.png'
const allowed = new Set([asset])
const original = (): DesignCanvas => ({
  fb_sq: { bgColor: '#ffffff', layers: [
    { id: 1, type: 'image', name: 'Logo', x: 20, y: 20, w: 100, h: 100, zIndex: 1, opacity: 1, src: asset, locked: true, animIn: 'none', animInDur: 0, startTime: 0, endTime: 5 },
    { id: 2, type: 'text', name: 'Headline', x: 120, y: 200, w: 800, h: 200, zIndex: 2, opacity: 1, text: 'Hello', animIn: 'fadeIn', animInDur: 1, startTime: 0, endTime: 5, feedBindings: [{ feedId: 'feed-1', column: 'title', property: 'text' }], motionPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }] }
  ] }
})
const propose = (value: object, canvas = original(), permission = false) => applyDesignProposal(JSON.stringify({ reply: 'Updated design for review.', ...value }), canvas, allowed, permission)

describe('native design proposal boundary', () => {
  it('provides model dimensions that match every editor format and custom import', () => {
    expect(Object.keys(DESIGN_FORMAT_DIMENSIONS).sort()).toEqual(Object.keys(FORMATS).sort())
    for (const [key, format] of Object.entries(FORMATS)) expect(DESIGN_FORMAT_DIMENSIONS[key]).toEqual({ w: format.w, h: format.h })
    expect(designCanvasDimensions({ custom_640x480: { layers: [] } })).toEqual({ custom_640x480: { w: 640, h: 480 } })
  })
  it.each([
    'cubic-bezier(0.250,0.100,0.250,1.000)',
    'cubic-bezier(0.123,-0.500,0.789,1.500)',
    'none', 'power2.inOut', 'back.out(1.7)', 'elastic.out(1,0.5)'
  ])('accepts native easing output in every animation field: %s', (easing) => {
    const changes = {
      ease: easing, animOutEase: easing,
      keyframes: { opacity: [{ time: 0, value: 0, easing }, { time: 1, value: 1 }] },
      motionPathTweens: [{ startTime: 0, endTime: 2, pathStart: 0, pathEnd: 1, ease: easing }]
    }
    const result = propose({ updates: [{ formatKey: 'fb_sq', layerId: 2, changes }] })
    expect(result.canvasData.fb_sq.layers[1]).toMatchObject(changes)
    expect(validateDesignCanvas(result.canvasData, allowed)).toEqual(result.canvasData)
  })
  it.each([
    'cubic-bezier(0,0,1)', 'cubic-bezier(0,0,1,1,1)',
    'cubic-bezier(-0.01,0,1,1)', 'cubic-bezier(0,0,1.1,1)',
    'cubic-bezier(0,-11,1,1)', 'cubic-bezier(0,0,1,11)',
    'cubic-bezier(0,NaN,1,Infinity)', 'cubic-bezier(0,0,1,1);alert(1)',
    'cubic-bezier(0,expression(1),1,1)'
  ])('rejects malformed, unbounded or executable Bézier easing: %s', (ease) => {
    expect(() => propose({ updates: [{ formatKey: 'fb_sq', layerId: 2, changes: { ease } }] })).toThrow()
  })
  it('accepts the native migrated template defaults including fonts and line heights', () => {
    for (const template of TEMPLATES) {
      const canvas = { mrec: { layers: template.layers(FORMATS.mrec).map((layer, index) => migrateLayer({ ...layer, id: index })) } }
      expect(validateDesignCanvas(canvas, allowed)).toEqual(canvas)
    }
  })
  it('updates text/layout/animation while retaining advanced native fields and the original', () => {
    const canvas = original()
    const before = structuredClone(canvas)
    const result = propose({ updates: [{ formatKey: 'fb_sq', layerId: 2, changes: { text: 'New\nheadline', y: 300, animIn: 'slideU', keyframes: { opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }] } } }] }, canvas)
    expect(canvas).toEqual(before)
    expect(result.canvasData.fb_sq.layers[1]).toMatchObject({ text: 'New\nheadline', y: 300, animIn: 'slideU', feedBindings: before.fb_sq.layers[1].feedBindings, motionPath: before.fb_sq.layers[1].motionPath })
  })
  it('creates a native portrait and story with explicit layout edits, preserving locked layers', () => {
    const result = propose({ variants: [{ sourceKey: 'fb_sq', formatKey: 'ig_port' }, { sourceKey: 'fb_sq', formatKey: 'ig_story' }], updates: [{ formatKey: 'ig_story', layerId: 2, changes: { y: 600, h: 400 } }] })
    expect(Object.keys(result.canvasData)).toEqual(['fb_sq', 'ig_port', 'ig_story'])
    expect(result.canvasData.ig_story.layers[0]).toEqual(original().fb_sq.layers[0])
    expect(result.canvasData.ig_story.layers[1]).toMatchObject({ id: 2, y: 600, h: 400 })
  })
  it('adds a validated native mask that references existing layers', () => {
    const result = propose({ additions: [{ formatKey: 'fb_sq', layer: { id: 3, type: 'rect', name: 'Mask', x: 0, y: 0, w: 1080, h: 1080, zIndex: 3, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 5, isMask: true, maskShape: 'ellipse', maskTargetIds: [2] } }] })
    expect(result.canvasData.fb_sq.layers[2]).toMatchObject({ isMask: true, maskShape: 'ellipse', maskTargetIds: [2] })
  })
  it('blocks locked edits/removals and permits explicit edits only with opt-in', () => {
    const updates = [{ formatKey: 'fb_sq', layerId: 1, changes: { x: 200 } }]
    expect(() => propose({ updates })).toThrow('Locked layer')
    expect(() => propose({ removals: [{ formatKey: 'fb_sq', layerId: 1 }] })).toThrow('Locked layer')
    expect(propose({ updates }, original(), true).canvasData.fb_sq.layers[0].x).toBe(200)
    expect(() => propose({ variants: [{ sourceKey: 'fb_sq', formatKey: 'ig_story' }], updates: [{ formatKey: 'ig_story', layerId: 1, changes: { x: 0 } }] })).toThrow('Locked layer')
  })
  it.each([
    { changes: { src: 'https://foreign.example.com/image.png' } },
    { changes: { src: 'javascript:alert(1)' } },
    { changes: { bgColor: 'url(https://foreign.example.com/image)' } },
    { changes: { bgColor: 'red;position:fixed' } },
    { changes: { textShadow: 'url(https://evil.example)' } },
    { changes: { fontFamily: 'Arial; background:red' } },
    { changes: { animIn: 'eval(alert(1))' } },
    { changes: { html: '<script>alert(1)</script>' } },
    { changes: { locked: false } },
    { changes: { maskTargetIds: [999] } },
    { changes: { endTime: -1 } },
    { changes: { startTime: 10, endTime: 1 } },
    { changes: { keyframes: { script: [{ time: 0, value: 1 }] } } }
  ])('rejects unsafe/unsupported model edits atomically: %j', ({ changes }) => {
    const canvas = original()
    const before = structuredClone(canvas)
    expect(() => propose({ updates: [{ formatKey: 'fb_sq', layerId: 2, changes }] }, canvas)).toThrow()
    expect(canvas).toEqual(before)
  })
  it.each(['not JSON', '{}', '{"reply":"done"}', '{"reply":"done","updates":{}}', '{"reply":"done","html":"<div/>"}'])('fails closed on malformed or empty output %s', (raw) => {
    expect(() => applyDesignProposal(raw, original(), allowed)).toThrow()
  })
  it('rejects unknown source, existing variant destination, duplicate IDs and missing layer references', () => {
    expect(() => propose({ variants: [{ sourceKey: 'absent', formatKey: 'ig_story' }] })).toThrow('Unknown format')
    expect(() => propose({ variants: [{ sourceKey: 'fb_sq', formatKey: 'fb_sq' }] })).toThrow('already exists')
    expect(() => propose({ updates: [{ formatKey: 'fb_sq', layerId: 999, changes: { x: 10 } }] })).toThrow('Unknown layer')
    expect(() => propose({ additions: [{ formatKey: 'fb_sq', layer: { ...original().fb_sq.layers[0], locked: false } }] })).toThrow('already exists')
  })
  it('bounds and authorizes unsaved canvas before using it as model context', () => {
    expect(() => validateDesignCanvas(original(), new Set())).toThrow('outside this project')
    const canvas = original()
    canvas.fb_sq.layers[1].text = 'x'.repeat(11000)
    expect(() => validateDesignCanvas(canvas, allowed)).toThrow()
    expect(() => validateDesignCanvas(JSON.parse('{"__proto__":{"layers":[]}}'), allowed)).toThrow()
  })
  it('allows a caption-only suggestion without claiming to mutate a canvas', () => {
    expect(propose({ caption: 'Review this caption', suggestedSchedule: 'Tomorrow at 10am in the client timezone' }).canvasData).toEqual(original())
  })
  it('rejects foreign client scope inputs and overlong history/prompt', () => {
    const request = { projectId: '11111111-1111-4111-8111-111111111111', prompt: 'Make this clearer', canvasData: original(), activeKey: 'fb_sq' }
    expect(designAssistRequestSchema.safeParse(request).success).toBe(true)
    expect(designAssistRequestSchema.safeParse({ ...request, clientId: 'foreign' }).success).toBe(false)
    expect(designAssistRequestSchema.safeParse({ ...request, prompt: 'x'.repeat(4001) }).success).toBe(false)
    expect(designAssistRequestSchema.safeParse({ ...request, history: Array.from({ length: 13 }, () => ({ role: 'user', content: 'Hello' })) }).success).toBe(false)
  })
})
