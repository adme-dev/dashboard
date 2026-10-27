import { describe, expect, it } from 'vitest'
import { newBootGate, validateCgroups, validateIsolation } from '../../workers/banner-engine/canary/policy.mjs'
import { createCanaryServer, createArgs, command } from '../../workers/banner-engine/canary/supervisor.mjs'
import { checkDisk, BUDGET, RESERVE } from '../../scripts/banner-studio/prepare-engine-cloud-canary.mjs'

describe('native canary fail-closed policy', () => {
  it('consumes a boot exactly once and rejects a delayed old-boot request', () => {
    const first = newBootGate('boot-1')
    expect(() => first.consume('wrong', 0)).toThrow('boot')
    first.consume('boot-1', 0)
    expect(() => first.consume('boot-1', 0)).toThrow('consumed')
    const restarted = newBootGate('boot-2')
    expect(() => restarted.consume('boot-1', 0)).toThrow('boot')
  })
  it('rejects all bodies instead of accepting caller-selected work', () => {
    const gate = newBootGate('boot-1')
    expect(() => gate.consume('boot-1', 1)).toThrow('payload')
    gate.consume('boot-1', 0)
  })
  it('requires effective cgroup v2 CPU, RAM, swap and PID ceilings', () => {
    const actual = { memory: '2147483648', swap: '0', pids: '32', cpu: '200000 100000' }
    expect(validateCgroups(actual)).toEqual(actual)
    for (const key of Object.keys(actual)) {
      expect(() => validateCgroups({ ...actual, [key]: 'max' })).toThrow('cgroup')
    }
    expect(() => validateCgroups({ ...actual, cpu: '100000 100000' })).toThrow('cgroup')
  })
  it('rejects unverified Docker isolation readback', () => {
    expect(() => validateIsolation({}, '/fixture')).toThrow()
  })
  it('requires sub-GiB artifact budget and 3 GiB free reserve', () => {
    expect(BUDGET).toBeLessThan(1024 ** 3)
    expect(() => checkDisk(BUDGET + RESERVE)).not.toThrow()
    expect(() => checkDisk(BUDGET + RESERVE - 1)).toThrow('reserve')
    expect(() => checkDisk(10 * 1024 ** 3, 1024 ** 3)).toThrow('budget')
  })
  it('retains accepted inner limits and disables all image pulls', () => {
    const args = createArgs('photocraft', '/fixed/input', 'fixed-name')
    expect(args).toContain('--pull=never')
    expect(args).toContain('65532:65532')
    expect(args).toContain('none')
    expect(args).toContain('2048m')
    expect(args).toContain('32')
    expect(args).not.toContain('--privileged')
    expect(args).not.toContain('/var/run/docker.sock')
  })
  it('bounds both command time and stdout/stderr bytes', async () => {
    await expect(command(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeout: 20 })).rejects.toThrow('deadline')
    await expect(command(process.execPath, ['-e', 'process.stdout.write("x".repeat(1024))'], { maxBytes: 10 })).rejects.toThrow('ceiling')
  })
  it('actual HTTP rejects payloads, wrong boots and concurrent/restarted replay', async () => {
    let calls = 0
    const start = async (bootId: string) => {
      const server = createCanaryServer({ bootId, packageSha256: 'test', execute: async () => {
        calls++
        await new Promise(resolve => setTimeout(resolve, 30))
        return { passed: true }
      } })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address() as { port: number }
      return { server, url: `http://127.0.0.1:${address.port}` }
    }
    const first = await start('boot-1')
    const post = (url: string, boot: string, body = '') => fetch(`${url}/run`, {
      method: 'POST', headers: { 'x-canary-boot': boot }, body
    })
    try {
      expect((await post(first.url, 'boot-1', '{"command":"anything"}')).status).toBe(409)
      expect((await post(first.url, 'wrong')).status).toBe(409)
      const replies = await Promise.all([post(first.url, 'boot-1'), post(first.url, 'boot-1')])
      expect(replies.map(r => r.status).sort()).toEqual([200, 409])
      expect(calls).toBe(1)
    } finally { await new Promise<void>(resolve => first.server.close(() => resolve())) }
    const second = await start('boot-2')
    try {
      expect((await post(second.url, 'boot-1')).status).toBe(409)
      expect(calls).toBe(1)
    } finally { await new Promise<void>(resolve => second.server.close(() => resolve())) }
  })
})
