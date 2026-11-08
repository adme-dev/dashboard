import { describe, expect, it, vi } from 'vitest'
import { createSerialMediaOperations } from '~~/app/utils/audio/mediaSaveQueue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('media editor persistence queue', () => {
  it('serializes saves and reads the latest revision only when each operation starts', async () => {
    const queue = createSerialMediaOperations()
    const gate = deferred()
    let revision = 0
    const submitted: number[] = []
    const save = () => queue.run(async () => {
      submitted.push(revision)
      await gate.promise
      revision += 1
    })
    const a = save()
    const b = save()
    await Promise.resolve()
    expect(submitted).toEqual([0])
    gate.resolve()
    await Promise.all([a, b])
    expect(submitted).toEqual([0, 1])
  })

  it('keeps version/render operations behind in-flight saves and ahead of later autosaves', async () => {
    const queue = createSerialMediaOperations()
    const gate = deferred()
    const order: string[] = []
    const a = queue.run(async () => {
      await gate.promise
      order.push('saved')
    })
    const b = queue.run(async () => {
      order.push('snapshot')
    })
    const c = queue.run(async () => {
      order.push('new edit saved')
    })
    gate.resolve()
    await Promise.all([a, b, c])
    expect(order).toEqual(['saved', 'snapshot', 'new edit saved'])
  })

  it('does not wedge explicit recovery after a conflict', async () => {
    const queue = createSerialMediaOperations()
    const recovery = vi.fn()
    await expect(queue.run(async () => {
      throw new Error('conflict')
    })).rejects.toThrow('conflict')
    await queue.run(recovery)
    expect(recovery).toHaveBeenCalledOnce()
  })
})
