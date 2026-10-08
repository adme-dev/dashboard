import { describe, expect, it } from 'vitest'
import { CustomerSetupDraft } from '~~/shared/pageStudio/customerSignup'
import { readSignupIntake, writeSignupIntake, clearSignupIntake } from '~~/app/utils/pageStudioSignupIntake'

const draft = { businessType: 'Automotive', goals: ['vehicles', 'enquiries'] }
function storage() {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) }
  }
}
describe('pre-account Page Studio choices', () => {
  it('restores validated choices only for the matching verified email', () => {
    const store = storage()
    writeSignupIntake(store, 'Paul@example.com', draft, 1000)
    expect(readSignupIntake(store, 'paul@example.com', 2000)).toEqual(draft)
    expect(readSignupIntake(store, 'someone-else@example.com', 2000)).toBeNull()
    expect(readSignupIntake(store, 'paul@example.com', 1000 + 86400001)).toBeNull()
    clearSignupIntake(store)
    expect(readSignupIntake(store, 'paul@example.com', 2000)).toBeNull()
  })
  it('rejects malformed choices and tolerates blocked browser storage', () => {
    const store = storage()
    writeSignupIntake(store, 'paul@example.com', { businessType: 'Automotive', goals: ['unknown'] }, 1000)
    expect(readSignupIntake(store, 'paul@example.com', 2000)).toBeNull()
    const blocked = {
      getItem() { throw Error('blocked') },
      setItem() { throw Error('blocked') },
      removeItem() { throw Error('blocked') }
    }
    expect(() => writeSignupIntake(blocked, 'paul@example.com', draft)).not.toThrow()
    expect(readSignupIntake(blocked, 'paul@example.com')).toBeNull()
    expect(() => clearSignupIntake(blocked)).not.toThrow()
  })
  it('accepts expanded planning goals while retaining duplicate and unknown-goal validation', () => {
    const setup = { businessName: 'Example', timezone: 'UTC', ...draft }
    expect(CustomerSetupDraft.safeParse(setup).success).toBe(true)
    expect(CustomerSetupDraft.safeParse({ ...setup, goals: ['vehicles', 'vehicles'] }).success).toBe(false)
    expect(CustomerSetupDraft.safeParse({ ...setup, goals: ['unknown'] }).success).toBe(false)
  })
})
