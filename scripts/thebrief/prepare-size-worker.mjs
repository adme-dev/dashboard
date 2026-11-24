import { createHash } from 'node:crypto'
import { readArchiveEntries } from './inspect-archive.mjs'
import { packageTheBriefSize } from './package-size.mjs'

// Reuse the converter runtime for this request. The caller dispatches one
// layout at a time and can terminate the worker if a layout times out.
process.on('message', async ({ archive, name }) => {
  try {
    const entries = readArchiveEntries(archive)
    const files = new Map(entries.map(entry => [entry.name, entry.data]))
    if (!files.has('index.html') || entries.some(entry => /\.zip$/i.test(entry.name))) {
      throw new Error('Each size needs one index.html at its ZIP root')
    }
    const sourceFile = path => {
      const data = files.get(path.replace(/^\.\//, ''))
      if (!data) throw new Error(`Source differs from archive: ${path}`)
      return data
    }
    const sourceSha256 = createHash('sha256').update(archive).digest('hex')
    const { pkg } = await packageTheBriefSize({ sourceFile, sourceSha256, name, folder: '', fontCache: process.env.THEBRIEF_REQUEST_FONT_CACHE })
    process.send({ pkg })
  } catch (cause) {
    process.send({ error: cause instanceof Error ? cause.message : 'This size could not be converted; the design is held for review' })
  }
})
