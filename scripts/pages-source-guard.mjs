import { spawnSync } from 'node:child_process'

function git(repositoryRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  })
  if (result.error || result.status !== 0) {
    // Remote errors may contain credential-bearing URLs. Report only the operation.
    throw new Error(`Unable to verify release source (git ${args[0]}). Deployment blocked.`)
  }
  return result.stdout.trim()
}

/** The Pages environment label is not evidence of Git source ancestry. */
export function verifyCurrentMainSource({ repositoryRoot, expectedSourceCommit } = {}) {
  const shallow = git(repositoryRoot, ['rev-parse', '--is-shallow-repository']) === 'true'
  git(repositoryRoot, [
    'fetch', '--no-tags', ...(shallow ? ['--unshallow'] : []),
    'origin', '+refs/heads/main:refs/remotes/origin/main'
  ])
  const sourceCommit = git(repositoryRoot, ['rev-parse', 'HEAD'])
  const mainCommit = git(repositoryRoot, ['rev-parse', 'refs/remotes/origin/main'])
  if (expectedSourceCommit && sourceCommit !== expectedSourceCommit) {
    throw new Error('Source commit changed after verification. Rebuild before deployment.')
  }
  const ancestor = git(repositoryRoot, ['merge-base', sourceCommit, mainCommit])
  if (ancestor !== mainCommit) {
    throw new Error(
      `Source ${sourceCommit} does not include current origin/main ${mainCommit}. Reconcile work onto current main before deployment.`
    )
  }
  return { sourceCommit, mainCommit }
}
