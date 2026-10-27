import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rename } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'

export const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export async function privateRoot(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('Invalid root')
  await mkdir(path, { recursive: true, mode: 0o700 })
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid root')
  return realpath(path)
}
export async function syncDirectory(path: string): Promise<void> {
  const file = await open(path, constants.O_RDONLY)
  try {
    await file.sync()
  } finally { await file.close() }
}
export async function writePrivate(path: string, bytes: string | Uint8Array): Promise<void> {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally { await file.close() }
  await syncDirectory(dirname(path))
}
export async function writeJournal(directory: string, value: object, terminal = false): Promise<void> {
  const path = join(directory, terminal ? 'transport.terminal.json' : 'transport.json')
  await writePrivate(path, JSON.stringify(value) + '\n')
  if (terminal) {
    await rename(path, join(directory, 'transport.json'))
    await syncDirectory(directory)
  }
}
/** Private roots must be operator-owned; never accept a path from HTTP. */
export async function readPrivate(root: string, path: string, maxBytes: number): Promise<Buffer> {
  const rel = relative(root, path)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Invalid path')
  let current = root
  for (const part of rel.split(sep)) {
    current = join(current, part)
    const info = await lstat(current)
    if (info.isSymbolicLink() || (current !== path && !info.isDirectory())) throw new Error('Invalid path')
  }
  const before = await lstat(path)
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.nlink !== 1 || info.size < 1 || info.size > maxBytes
      || info.ino !== before.ino || info.dev !== before.dev) throw new Error('Invalid file')
    const bytes = Buffer.alloc(info.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const read = await file.read(bytes, offset, bytes.length - offset, offset)
      if (!read.bytesRead) break
      offset += read.bytesRead
    }
    const after = await file.stat()
    if (offset !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs)
      throw new Error('File changed')
    return bytes.subarray(0, offset)
  } finally { await file.close() }
}
