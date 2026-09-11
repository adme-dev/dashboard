import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { verifyCurrentMainSource } from '../../scripts/pages-source-guard.mjs'

const ownedFixtures: string[] = []
afterAll(() => {
  for (const root of ownedFixtures) rmSync(root, { recursive: true, force: true })
})

function repository() {
  const root = mkdtempSync(path.join(tmpdir(), 'pages-source-guard-'))
  ownedFixtures.push(root)
  const remote = path.join(root, 'remote.git')
  const cwd = path.join(root, 'work')
  const run = (args: string[]) => execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' })
  execFileSync('git', ['clone', remote, cwd], { stdio: 'ignore' })
  run(['config', 'user.name', 'Release guard fixture'])
  run(['config', 'user.email', 'release-guard@example.invalid'])
  run(['config', 'commit.gpgsign', 'false'])
  const hooks = path.join(root, 'empty-hooks')
  mkdirSync(hooks)
  run(['config', 'core.hooksPath', hooks])
  run(['checkout', '-b', 'main'])
  const commit = (name: string) => {
    writeFileSync(path.join(cwd, name), name)
    run(['add', name])
    run(['commit', '-m', name])
    return run(['rev-parse', 'HEAD'])
  }
  const base = commit('initial')
  run(['push', 'origin', 'main'])
  return { root, remote, cwd, run, commit, base }
}

describe('Pages current source guard', () => {
  it('allows a clean feature branch containing freshly fetched main', () => {
    const repo = repository()
    repo.run(['checkout', '-b', 'fix/current-work'])
    const sourceCommit = repo.commit('feature')
    expect(verifyCurrentMainSource({ repositoryRoot: repo.cwd })).toEqual({
      sourceCommit, mainCommit: repo.base
    })
  })

  it('blocks divergent old work even when its local branch is named main', () => {
    const repo = repository()
    const latest = repo.commit('qr-codes')
    repo.run(['push', 'origin', 'main'])
    repo.run(['checkout', '--detach', repo.base])
    repo.run(['branch', '-D', 'main'])
    repo.run(['checkout', '-b', 'main'])
    repo.commit('old-release-feature')
    // Stale tracking state must not make the candidate appear current.
    repo.run(['update-ref', 'refs/remotes/origin/main', repo.base])
    expect(() => verifyCurrentMainSource({ repositoryRoot: repo.cwd }))
      .toThrow(/does not include current origin\/main/)
    expect(repo.run(['rev-parse', 'origin/main'])).toBe(latest)
  })

  it('blocks when main advances during the build', () => {
    const repo = repository()
    const checked = verifyCurrentMainSource({ repositoryRoot: repo.cwd })
    const latest = repo.commit('new-main-feature')
    repo.run(['push', 'origin', 'main'])
    repo.run(['checkout', '--detach', repo.base])
    expect(() => verifyCurrentMainSource({
      repositoryRoot: repo.cwd, expectedSourceCommit: checked.sourceCommit
    })).toThrow(/does not include current origin\/main/)
    expect(repo.run(['rev-parse', 'origin/main'])).toBe(latest)
  })

  it('blocks a changed source commit between build and upload', () => {
    const repo = repository()
    const checked = verifyCurrentMainSource({ repositoryRoot: repo.cwd })
    repo.commit('changed-after-build')
    expect(() => verifyCurrentMainSource({
      repositoryRoot: repo.cwd, expectedSourceCommit: checked.sourceCommit
    })).toThrow(/Source commit changed/)
  })

  it('fails closed when the remote cannot be fetched', () => {
    const repo = repository()
    repo.run(['remote', 'set-url', 'origin', path.join(repo.cwd, 'missing.git')])
    expect(() => verifyCurrentMainSource({ repositoryRoot: repo.cwd }))
      .toThrow(/Unable to verify release source/)
  })

  it('fetches complete history for a shallow CI checkout', () => {
    const repo = repository()
    const latest = repo.commit('current-main')
    repo.run(['push', 'origin', 'main'])
    const shallow = path.join(repo.root, 'shallow')
    execFileSync('git', ['clone', '--depth', '1', '--branch', 'main',
      pathToFileURL(repo.remote).href, shallow], { stdio: 'ignore' })
    expect(verifyCurrentMainSource({ repositoryRoot: shallow })).toEqual({
      sourceCommit: latest, mainCommit: latest
    })
    expect(execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: shallow, encoding: 'utf8'
    }).trim()).toBe('false')
  })
})
