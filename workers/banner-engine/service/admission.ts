import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rename } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

export interface HostStorage {
  root: string
  identity: { device: number, inode: number }
}
export type HoldReason
  = | 'admission-exists'
    | 'configuration-invalid'
    | 'worker-uncertain'
    | 'worker-configuration'
    | 'worker-threw'
    | 'shutdown-unconfirmed'
    | 'cycle-unconfirmed'
    | 'journal-unavailable'
export type ServicePhase
  = 'starting' | 'active' | 'idle' | 'settled' | 'held' | 'stopped'
interface State {
  phase: ServicePhase
  cycle: number
  engine?: 'photocraft' | 'vectorcraft'
  reason?: HoldReason
}
async function syncDirectory(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
async function privateDirectory(path: string) {
  const info = await lstat(path)
  if (
    !info.isDirectory()
    || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700
    || info.uid !== process.getuid?.()
    || (await realpath(path)) !== path
  )
    throw new Error('Storage unavailable')
  return info
}
/** Roots are provisioned by an operator, never recreated on a missing mount. */
export async function validateStorage(configuration: HostStorage) {
  if (
    !isAbsolute(configuration.root)
    || !Number.isSafeInteger(configuration.identity?.device)
    || !Number.isSafeInteger(configuration.identity?.inode)
  )
    throw new Error('Storage unavailable')
  const root = await privateDirectory(configuration.root)
  if (
    root.dev !== configuration.identity.device
    || root.ino !== configuration.identity.inode
  )
    throw new Error('Storage unavailable')
  for (const name of ['staging', 'attempts']) {
    const child = await privateDirectory(join(configuration.root, name))
    if (child.dev !== root.dev) throw new Error('Storage unavailable')
  }
}
export async function inspectAdmission(
  configuration: HostStorage
): Promise<{ status: 'available' | 'held' | 'unavailable', ready: false }> {
  try {
    await validateStorage(configuration)
    try {
      await lstat(join(configuration.root, 'admission'))
      return { status: 'held', ready: false }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { status: 'available', ready: false }
    }
  } catch {
    return { status: 'unavailable', ready: false }
  }
}

/** An existing gate, including an empty one, is never recovered automatically. */
export async function acquireAdmission(configuration: HostStorage) {
  const directory = join(configuration.root, 'admission')
  try {
    await mkdir(directory, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null
    throw error
  }
  // Creation must survive a host crash before any claim is sent.
  await syncDirectory(configuration.root)
  const sessionId = randomUUID()
  const update = async (state: State) => {
    const temporary = join(directory, `state-${randomUUID()}.tmp`)
    const file = await open(
      temporary,
      constants.O_WRONLY
      | constants.O_CREAT
      | constants.O_EXCL
      | constants.O_NOFOLLOW,
      0o600
    )
    try {
      await file.writeFile(
        JSON.stringify({
          version: 1,
          sessionId,
          pid: process.pid,
          automaticRetry: false,
          ...state
        }) + '\n'
      )
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, join(directory, 'state.json'))
    await syncDirectory(directory)
  }
  await update({ phase: 'starting', cycle: 0 })
  return {
    update,
    async release(cycle: number) {
      await validateStorage(configuration)
      await update({ phase: 'stopped', cycle })
      const history = join(configuration.root, 'history')
      try {
        await mkdir(history, { mode: 0o700 })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
      const info = await privateDirectory(history)
      if (info.dev !== configuration.identity.device)
        throw new Error('Storage unavailable')
      await syncDirectory(configuration.root)
      const archive = join(history, sessionId)
      await mkdir(archive, { mode: 0o700 })
      await syncDirectory(history)
      // Retain the entire gate/journal; only a proven settled service gets here.
      // Crashing before rename leaves a hold, even if the journal says stopped.
      await rename(directory, join(archive, 'admission'))
      await syncDirectory(archive)
      await syncDirectory(configuration.root)
    }
  }
}
