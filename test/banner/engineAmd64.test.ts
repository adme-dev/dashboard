import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { verifyPublishedChecksum, executionEvidence, extractSelected } from '../../scripts/banner-studio/prove-engine-amd64-prepare.mjs'

describe('AMD64 qualification boundary', () => {
  it('requires one exact official checksum entry, rejecting missing, mismatched and duplicate entries', () => {
    const pin = 'a'.repeat(64)
    expect(verifyPublishedChecksum(`${pin}  engine.tar.gz\n`, 'engine.tar.gz', pin)).toBe(pin)
    for (const sums of ['', `${'b'.repeat(64)}  engine.tar.gz`, `${pin}  other.tar.gz`, `${pin}  engine.tar.gz\n${pin}  engine.tar.gz`]) {
      expect(() => verifyPublishedChecksum(sums, 'engine.tar.gz', pin)).toThrow()
    }
  })
  it('cannot call an ARM64 daemon native AMD64 or infer hosted acceptance from a local daemon', () => {
    expect(executionEvidence('linux', 'aarch64')).toEqual({ executionMode: 'emulated-linux-amd64', hostedAcceptance: false })
    expect(executionEvidence('linux', 'x86_64')).toEqual({ executionMode: 'native-linux-amd64', hostedAcceptance: false })
    expect(() => executionEvidence('windows', 'amd64')).toThrow()
    expect(() => executionEvidence('linux', 'unknown')).toThrow()
  })
  it('extracts only the pinned CLI and retains notices while excluding desktop binaries', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'banner-amd64-test-')))
    try {
      const archive = join(root, 'fixture.tar.gz')
      execFileSync('python3', ['-c', `import io,sys,tarfile
with tarfile.open(sys.argv[1],'w:gz') as t:
 for path,data in [('bin/photocraft-cli',b'CLI'),('share/doc/photocraft/LICENSE-MIT',b'licence'),('bin/photocraft',b'desktop')]:
  m=tarfile.TarInfo('photocraft-0.16.0-linux-x86_64/'+path); m.size=len(data); t.addfile(m,io.BytesIO(data))`, archive])
      const files = extractSelected(archive, join(root, 'build'), 'photocraft', '0.16.0', 1024)
      expect(files.map(file => file.path)).toEqual(['bin/photocraft-cli', 'notices/photocraft/LICENSE-MIT'])
      expect(await readFile(join(root, 'build/notices/photocraft/LICENSE-MIT'), 'utf8')).toBe('licence')
      await expect(readFile(join(root, 'build/bin/photocraft'))).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  it.each(['traversal', 'link', 'duplicate', 'oversize'])('rejects selected archive %s without extracting a CLI', async (attack) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'banner-amd64-test-')))
    try {
      const archive = join(root, 'fixture.tar.gz')
      execFileSync('python3', ['-c', `import io,sys,tarfile
archive,attack=sys.argv[1:]
with tarfile.open(archive,'w:gz') as t:
 name='photocraft-0.16.0-linux-x86_64/share/doc/photocraft/'
 if attack=='traversal': name+='../../../../outside'
 else: name+='LICENSE'
 m=tarfile.TarInfo(name)
 if attack=='link':
  m.type=tarfile.SYMTYPE; m.linkname='/etc/passwd'; t.addfile(m)
 else:
  data=b'x'*(1025 if attack=='oversize' else 1); m.size=len(data); t.addfile(m,io.BytesIO(data))
  if attack=='duplicate': t.addfile(m,io.BytesIO(data))`, archive, attack])
      const expected = { traversal: 'Unsafe member path', link: 'Selected links/devices forbidden', duplicate: 'Duplicate selected member', oversize: 'Selected extraction exceeds budget' }[attack]
      expect(() => extractSelected(archive, join(root, 'build'), 'photocraft', '0.16.0', 1024)).toThrow(expected)
      await expect(readFile(join(root, 'outside'))).rejects.toThrow()
      await expect(readFile(join(root, 'build/bin/photocraft-cli'))).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
