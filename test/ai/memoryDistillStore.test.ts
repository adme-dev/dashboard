import { describe, it, expect, vi } from 'vitest'
import { distillAndStoreMemories, type DistillStoreDeps } from '~~/server/utils/ai/memory/orchestrate'

const TURN = { userMessage: 'I always report Acme spend in AUD', assistantMessage: 'Noted — AUD it is.' }

const deps = (over: Partial<DistillStoreDeps> = {}): DistillStoreDeps => ({
  complete: vi.fn().mockResolvedValue('[{"memType":"semantic","content":"reports Acme in AUD","salience":0.8}]'),
  recentContents: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue('new-id'),
  index: vi.fn().mockResolvedValue(true),
  ...over,
})

describe('distillAndStoreMemories', () => {
  it('distills candidates and saves each as an inferred memory', async () => {
    const d = deps()
    const saved = await distillAndStoreMemories({ userId: 'u1', turn: TURN }, d)
    expect(saved).toBe(1)
    expect(d.save).toHaveBeenCalledTimes(1)
    expect(d.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      memType: 'semantic',
      content: 'reports Acme in AUD',
      source: 'inferred',
      salience: 0.8,
    }))
  })

  it('indexes each saved memory for vector recall (keyed by the new row id)', async () => {
    const d = deps({ save: vi.fn().mockResolvedValue('row-9') })
    await distillAndStoreMemories({ userId: 'u1', turn: TURN }, d)
    expect(d.index).toHaveBeenCalledWith(undefined, expect.objectContaining({
      id: 'row-9', userId: 'u1', scope: 'user', memType: 'semantic', content: 'reports Acme in AUD',
    }))
  })

  it('dedups against existing memory contents (case-insensitive)', async () => {
    const d = deps({ recentContents: vi.fn().mockResolvedValue(['Reports Acme In AUD']) })
    const saved = await distillAndStoreMemories({ userId: 'u1', turn: TURN }, d)
    expect(saved).toBe(0)
    expect(d.save).not.toHaveBeenCalled()
  })

  it('no userId → 0, never calls the model (stays unscoped-safe)', async () => {
    const d = deps()
    expect(await distillAndStoreMemories({ userId: '', turn: TURN }, d)).toBe(0)
    expect(d.complete).not.toHaveBeenCalled()
  })

  it('empty turn → 0, never calls the model', async () => {
    const d = deps()
    expect(await distillAndStoreMemories({ userId: 'u1', turn: { userMessage: '', assistantMessage: '' } }, d)).toBe(0)
    expect(d.complete).not.toHaveBeenCalled()
  })

  it('model error → 0 (fail-safe, the turn is unaffected)', async () => {
    const d = deps({ complete: vi.fn().mockRejectedValue(new Error('groq down')) })
    expect(await distillAndStoreMemories({ userId: 'u1', turn: TURN }, d)).toBe(0)
    expect(d.save).not.toHaveBeenCalled()
  })

  it('a failing save skips that candidate but keeps the rest', async () => {
    const d = deps({
      complete: vi.fn().mockResolvedValue(JSON.stringify([
        { memType: 'semantic', content: 'fact one', salience: 0.6 },
        { memType: 'procedural', content: 'routine two', salience: 0.6 },
      ])),
      save: vi.fn()
        .mockRejectedValueOnce(new Error('constraint'))
        .mockResolvedValueOnce('id2'),
    })
    const saved = await distillAndStoreMemories({ userId: 'u1', turn: TURN }, d)
    expect(saved).toBe(1)
    expect(d.save).toHaveBeenCalledTimes(2)
  })

  it('a failing recentContents lookup degrades to no-dedup, still saves', async () => {
    const d = deps({ recentContents: vi.fn().mockRejectedValue(new Error('db down')) })
    const saved = await distillAndStoreMemories({ userId: 'u1', turn: TURN }, d)
    expect(saved).toBe(1)
  })
})
