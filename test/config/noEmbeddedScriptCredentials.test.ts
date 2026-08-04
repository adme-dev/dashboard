import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('repository script credentials', () => {
  it('does not embed database passwords or JWT-like API tokens', () => {
    const files = execFileSync('git', ['ls-files', 'scripts'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/i.test(source)
        || /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/.test(source)
    })

    expect(offenders).toEqual([])
  })
})
