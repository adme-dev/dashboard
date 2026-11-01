import { describe, expect, it, vi } from 'vitest'
import { uploadTheBriefAssets } from '../../app/utils/thebrief-asset-uploads'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const asset = (id: number) => ({ path: `./media/${id}.png`, sha256: String(id).padStart(64, '0') })
const stored = (id: number, clientId = 'client-a') => ({ url: `https://assets.example.com/${clientId}/${id}.png`, clientId })
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('bounded TheBrief asset uploads', () => {
  it('keeps at most three writes in flight and returns paths in source order', async () => {
    const gates = Array.from({ length: 5 }, () => deferred<ReturnType<typeof stored>>())
    let active = 0, peak = 0
    const upload = vi.fn(async (value: ReturnType<typeof asset>) => {
      const id = Number(value.sha256)
      peak = Math.max(peak, ++active)
      try {
        return await gates[id]!.promise
      } finally { active-- }
    })
    const result = uploadTheBriefAssets(Array.from({ length: 5 }, (_, i) => asset(i)), 'client-a', new Map(), upload)
    expect(upload).toHaveBeenCalledTimes(3)
    gates[1]!.resolve(stored(1))
    await flush()
    expect(upload).toHaveBeenCalledTimes(4)
    gates[0]!.resolve(stored(0))
    await flush()
    expect(upload).toHaveBeenCalledTimes(5)
    for (const id of [4, 2, 3]) gates[id]!.resolve(stored(id))
    expect([...await result]).toEqual(Array.from({ length: 5 }, (_, i) => [asset(i).path, stored(i).url]))
    expect(peak).toBe(3)
  })

  it('uploads identical bytes only once, while retaining every source path', async () => {
    const input = [asset(1), { ...asset(1), path: './media/alias.png' }]
    const upload = vi.fn(async () => stored(1))
    const cache = new Map<string, string>()
    expect([...await uploadTheBriefAssets(input, 'client-a', cache, upload)]).toEqual(input.map(a => [a.path, stored(1).url]))
    await uploadTheBriefAssets(input, 'client-a', cache, upload)
    expect(upload).toHaveBeenCalledOnce()
  })

  it('never reuses another client’s acknowledged upload', async () => {
    const cache = new Map([[`client-a:${asset(1).sha256}`, stored(1).url]])
    const upload = vi.fn(async () => stored(1, 'client-b'))
    const result = await uploadTheBriefAssets([asset(1)], 'client-b', cache, upload)
    expect(result.get(asset(1).path)).toBe(stored(1, 'client-b').url)
    expect(upload).toHaveBeenCalledWith(asset(1), `client-b:${asset(1).sha256}`)
    expect(cache.get(`client-a:${asset(1).sha256}`)).toBe(stored(1).url)
  })

  it.each([{ url: '', clientId: 'client-a' }, stored(1, 'wrong-client')])('rejects an invalid managed-asset acknowledgement %j', async (response) => {
    const cache = new Map<string, string>()
    await expect(uploadTheBriefAssets([asset(1)], 'client-a', cache, async () => response)).rejects.toThrow('selected client')
    expect(cache.size).toBe(0)
  })

  it('stops queued writes after failure, drains in-flight writes and retains their receipts for retry', async () => {
    const gates = Array.from({ length: 3 }, () => deferred<ReturnType<typeof stored>>())
    const cache = new Map<string, string>()
    const upload = vi.fn((value: ReturnType<typeof asset>) => gates[Number(value.sha256)]!.promise)
    const problem = new Error('Connection lost')
    let settled = false
    const result = uploadTheBriefAssets(Array.from({ length: 5 }, (_, i) => asset(i)), 'client-a', cache, upload)
      .catch((error) => {
        settled = true
        return error
      })
    gates[0]!.reject(problem)
    await flush()
    expect(settled).toBe(false)
    gates[1]!.resolve(stored(1))
    gates[2]!.resolve(stored(2))
    expect(await result).toBe(problem)
    expect(upload).toHaveBeenCalledTimes(3)
    expect(cache.size).toBe(2)
    const retry = vi.fn(async (value: ReturnType<typeof asset>) => stored(Number(value.sha256)))
    expect((await uploadTheBriefAssets(Array.from({ length: 5 }, (_, i) => asset(i)), 'client-a', cache, retry)).size).toBe(5)
    expect(retry.mock.calls.map(([value]) => Number(value.sha256))).toEqual([0, 3, 4])
  })
})
