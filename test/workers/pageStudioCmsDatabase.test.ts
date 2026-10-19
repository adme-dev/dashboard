import type { PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'
import { describe, expect, it, vi } from 'vitest'
import { runCmsDatabaseInvocation, transactionWithoutRetry, queryOneFresh } from '../../workers/page-studio-management/src/cmsDatabase'

describe('CMS Worker database invocation', () => {
  it('denies database use outside an invocation', async () => {
    await expect(queryOneFresh('SELECT 1')).rejects.toThrow('invocation')
  })
  it('isolates interleaved environment runners across awaits', async () => {
    const runner = (environment: string) => async <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => work({ query: async () => ({ rows: [{ environment }] as never }) })
    const results = await Promise.all(['staging', 'production'].map(environment =>
      runCmsDatabaseInvocation(runner(environment), async () => {
        await Promise.resolve()
        const first = await queryOneFresh('SELECT 1')
        await new Promise(resolve => setTimeout(resolve, 5))
        return [first, await transactionWithoutRetry(db => db.query('SELECT 2'))]
      })))
    expect(results.map(([first]) => first)).toEqual([{ environment: 'staging' }, { environment: 'production' }])
    expect(results.map(([, result]) => result.rows[0])).toEqual([{ environment: 'staging' }, { environment: 'production' }])
  })
  it('revokes leaked asynchronous contexts after return and rejection', async () => {
    for (const rejects of [false, true]) {
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let late!: Promise<unknown>
      let retained!: () => Promise<unknown>
      const work = runCmsDatabaseInvocation(async callback => callback({ query: async () => ({ rows: [] }) }), async () => {
        retained = () => queryOneFresh('SELECT 1')
        late = gate.then(() => queryOneFresh('SELECT 1'))
        if (rejects) throw new Error('Expected rejection')
      })
      if (rejects) await expect(work).rejects.toThrow('Expected rejection')
      else await work
      release()
      await expect(late).rejects.toThrow('invocation')
      await expect(retained()).rejects.toThrow('invocation')
    }
  })
  it('does not retry failed transactions or reuse transactions across independent calls', async () => {
    let calls = 0
    const runner = async <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => {
      calls++
      return callback({ query: async () => ({ rows: [] }) })
    }
    await runCmsDatabaseInvocation(runner, async () => {
      await queryOneFresh('SELECT 1')
      await queryOneFresh('SELECT 2')
      await expect(transactionWithoutRetry(async () => {
        throw new Error('Lost acknowledgement')
      })).rejects.toThrow('Lost acknowledgement')
    })
    expect(calls).toBe(3)
  })
})

it('restores the parent context after a nested invocation rejects', async () => {
  const runner = (environment: string) => async <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) =>
    work({ query: async () => ({ rows: [{ environment }] as never }) })
  await runCmsDatabaseInvocation(runner('staging'), async () => {
    await expect(runCmsDatabaseInvocation(runner('production'), async () => {
      expect(await queryOneFresh('SELECT scope')).toEqual({ environment: 'production' })
      throw new Error('Nested rejection')
    })).rejects.toThrow('Nested rejection')
    expect(await queryOneFresh('SELECT scope')).toEqual({ environment: 'staging' })
  })
})

it('revokes a retained transaction client before its invocation ends', async () => {
  const query = vi.fn(async () => ({ rows: [] }))
  await runCmsDatabaseInvocation(async work => work({ query }), async () => {
    let retained!: PageStudioControlQueryClient
    await transactionWithoutRetry(async (db) => {
      retained = db
    })
    await expect(retained.query('SELECT late')).rejects.toThrow('invocation')
    expect(query).not.toHaveBeenCalled()
  })
})
