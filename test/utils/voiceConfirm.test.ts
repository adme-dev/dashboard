import { describe, expect, it } from 'vitest'
import { classifyConfirmUtterance } from '~~/app/utils/voiceConfirm'

describe('classifyConfirmUtterance', () => {
  it('detects affirmatives', () => {
    for (const s of ['confirm', 'Yes', 'yes please', 'go ahead', 'do it', 'proceed', 'yep, do it']) {
      expect(classifyConfirmUtterance(s)).toBe('affirmative')
    }
  })
  it('detects negatives', () => {
    for (const s of ['cancel', 'No', 'nope', 'don\'t do that', 'never mind', 'abort', 'stop']) {
      expect(classifyConfirmUtterance(s)).toBe('negative')
    }
  })
  it('detects session-stop phrases', () => {
    for (const s of ['stop listening', 'goodbye', 'end session', 'exit voice']) {
      expect(classifyConfirmUtterance(s)).toBe('stop')
    }
  })
  it('treats anything else (or empty) as ambiguous', () => {
    for (const s of ['', '   ', 'what\'s the weather', 'create another task', 'maybe later']) {
      expect(classifyConfirmUtterance(s)).toBe('ambiguous')
    }
  })
  it('uses word boundaries (no false positives inside words)', () => {
    expect(classifyConfirmUtterance('snowfall is heavy')).toBe('ambiguous') // not "no"
  })
  it('matches stop phrases on word boundaries too (not substrings of larger words)', () => {
    expect(classifyConfirmUtterance('goodbyes everyone')).toBe('ambiguous') // not "goodbye"
    expect(classifyConfirmUtterance('say goodbye')).toBe('stop') // whole word still matches
  })
})
