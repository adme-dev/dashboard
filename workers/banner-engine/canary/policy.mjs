import assert from 'node:assert/strict'

// Memory is only the second fence. Remote durable consumption gates EVERY boot.
export function newBootGate(bootId) {
  let consumed = false
  return {
    consume(expectedBoot, bodyBytes) {
      assert.equal(expectedBoot, bootId, 'boot mismatch')
      assert.equal(bodyBytes, 0, 'payload forbidden')
      assert.equal(consumed, false, 'boot consumed')
      consumed = true
    }
  }
}

export function validateCgroups(value) {
  assert.equal(value.memory, '2147483648', 'cgroup memory')
  assert.equal(value.swap, '0', 'cgroup swap')
  assert.equal(value.pids, '32', 'cgroup pids')
  const [quota, period] = value.cpu.split(/\s+/).map(Number)
  assert(Number.isSafeInteger(period) && period > 0 && quota === period * 2, 'cgroup CPU')
  return value
}

export function validateIsolation(i, input) {
  assert.equal(i.Config.User, '65532:65532')
  const h = i.HostConfig
  assert.equal(h.NetworkMode, 'none')
  assert.equal(h.ReadonlyRootfs, true)
  assert.equal(h.Privileged, false)
  assert.equal(h.Memory, 2147483648)
  assert.equal(h.MemorySwap, h.Memory)
  assert.equal(h.NanoCpus, 2e9)
  assert.equal(h.PidsLimit, 32)
  assert.deepEqual(h.CapDrop, ['ALL'])
  assert(!h.CapAdd?.length)
  assert(h.SecurityOpt.includes('no-new-privileges'))
  assert.equal(h.LogConfig.Type, 'none')
  assert.equal(i.Mounts.length, 1)
  assert.equal(i.Mounts[0].Type, 'bind')
  assert.equal(i.Mounts[0].Source, input)
  assert.equal(i.Mounts[0].RW, false)
  assert(i.Mounts[0].Destination.startsWith('/input/document.'))
  for (const [path, size] of [['/tmp', 67108864], ['/output', 9437184]]) {
    for (const flag of ['rw', 'noexec', 'nosuid', 'nodev', `size=${size}`, 'mode=1777']) {
      assert(h.Tmpfs[path].split(',').includes(flag), `tmpfs ${path} ${flag}`)
    }
  }
  for (const [name, value] of [['fsize', 8388608], ['nofile', 128]]) {
    assert(h.Ulimits.some(u => u.Name === name && u.Soft === value && u.Hard === value))
  }
  return { user: i.Config.User, network: h.NetworkMode, readOnly: h.ReadonlyRootfs,
    memory: h.Memory, memorySwap: h.MemorySwap, nanoCpus: h.NanoCpus, pids: h.PidsLimit,
    capDrop: h.CapDrop, securityOpt: h.SecurityOpt, mounts: i.Mounts, tmpfs: h.Tmpfs, ulimits: h.Ulimits }
}
