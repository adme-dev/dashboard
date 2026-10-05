import { describe, expect, it } from 'vitest'
import { beginImportAttempt, finishImportAttempt, importAttemptKey } from '../../app/utils/thebrief-import-attempt'

describe('uncertain import recovery', () => {
  it('keeps a failed attempt blocked across new controller instances until reconciled', () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value) },
      removeItem: (key: string) => { data.delete(key) } }
    const key = importAttemptKey('client-a', 'archive-a')
    beginImportAttempt(storage, key)
    expect(() => beginImportAttempt({ ...storage }, key)).toThrow(/reconciliation/)
    expect(() => beginImportAttempt(storage, importAttemptKey('client-b', 'archive-a'))).not.toThrow()
    finishImportAttempt(storage, key)
    expect(() => beginImportAttempt(storage, key)).not.toThrow()
  })
  it('does not permit a write when the attempt marker cannot be stored', () => {
    expect(() => beginImportAttempt({ getItem: () => null,
      setItem: () => { throw new Error('Storage denied') },
      removeItem: () => {} }, 'x')).toThrow('Storage denied')
  })
})
