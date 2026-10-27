// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inspectEngineService } from '../../workers/banner-engine/service/index'

let root: string
let identity: { device: number, inode: number }
let children: ChildProcess[]
const serviceUrl = new URL(
  '../../workers/banner-engine/service/index.ts',
  import.meta.url
).href
// Run the actual service/transport in an independent OS process, with synthetic
// native work and an in-memory authority. Never contact a real service or Docker.
const harness = `
import { runEngineService } from ${JSON.stringify(serviceUrl)};
import { randomUUID, createHash } from 'node:crypto';
const [root, identityJSON, mode] = process.argv.slice(1);
const identity = JSON.parse(identityJSON);
const hash = text => createHash('sha256').update(text).digest('hex');
const controller = new AbortController();
process.on('SIGTERM', () => controller.abort());
const request = {
 version:1, jobId:randomUUID(), attemptId:randomUUID(), projectId:randomUUID(), clientId:null,
 sourceRevision:'1',sourceHash:hash('source'), engine:{id:'photocraft',version:'0.16.0'},operation:'render-preview',
 input:{id:randomUUID(),bytes:5,sha256:hash('input'),mimeType:'application/x-photocraft'},
 output:{mimeType:'image/png',width:2,height:2},
 limits:{maxInputBytes:1024,maxOutputBytes:4096,maxPixels:100,timeoutMs:60000,memoryMb:256,cpuCount:1,maxProcesses:16,maxLogBytes:128},
 deadlineAt:new Date(Date.now()+120000).toISOString()
};
const json = value => new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const workers = ['photocraft','vectorcraft'].map(id => ({
 origin:'https://engine.example',serviceToken:'fixture-secret-token-'.repeat(3),pollIntervalMs:1000,abortGraceMs:20,
 adapter:{capability:{engine:{id,version:id==='photocraft'?'0.16.0':'0.17.0'},operation:'render-preview',inputMimeType:'application/x-'+id,executableSha256:hash('exe'),capabilityProofSha256:hash('proof')},
 async run({signal}) { process.stdout.write('native-started\\n'); await new Promise(resolve => { if(mode==='cooperative') signal.addEventListener('abort',resolve,{once:true}); }); }},
 async fetch(url, init) {
  const action=JSON.parse(init.body);
  if(action.action==='claim') { process.stdout.write('claim\\n'); return json({request,claimToken:'a'.repeat(64)}); }
  if(action.action==='input') return json({base64:Buffer.from('input').toString('base64')});
  if(action.action==='status') return json({status:'running'});
  if(action.action==='fail') return json({status:action.termination==='unconfirmed'?'uncertain':'cancelled'});
  throw new Error('Unexpected completion');
 }
}));
const outcome=await runEngineService({root,identity,enabled:'true',workers,signal:controller.signal,shutdownGraceMs:1000});
process.stdout.write(JSON.stringify(outcome)+'\\n');
process.exit(outcome.status==='stopped'?0:2);
`
function launch(mode: string) {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      harness,
      root,
      JSON.stringify(identity),
      mode
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )
  children.push(child)
  let output = '',
    errors = ''
  child.stdout!.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr!.on('data', (chunk) => {
    errors += String(chunk)
  })
  const exited = once(child, 'exit')
  return {
    child,
    exited,
    output: () => output,
    errors: () => errors,
    async waitFor(text: string) {
      for (let n = 0; n < 300; n++) {
        if (output.includes(text)) return
        if (child.exitCode !== null)
          throw new Error(`Child exited: ${output} ${errors}`)
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      throw new Error(`Child stalled: ${output} ${errors}`)
    }
  }
}
beforeEach(async () => {
  children = []
  root = await mkdtemp(
    join(await realpath(tmpdir()), 'engine-service-process-')
  )
  await mkdir(join(root, 'staging'), { mode: 0o700 })
  await mkdir(join(root, 'attempts'), { mode: 0o700 })
  const info = await stat(root)
  identity = { device: info.dev, inode: info.ino }
})
afterEach(async () => {
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await once(child, 'exit')
    }
  await rm(root, { recursive: true, force: true })
})
describe('engine service process lifecycle', () => {
  it('blocks a competing OS process and keeps a crash hold after SIGKILL and restart', async () => {
    const first = launch('noncooperative')
    await first.waitFor('native-started')
    const competitor = launch('noncooperative')
    expect((await competitor.exited)[0]).toBe(2)
    expect(competitor.output()).toContain('admission-exists')
    expect(competitor.output()).not.toContain('claim\n')
    first.child.kill('SIGKILL')
    await first.exited
    const restarted = launch('noncooperative')
    expect((await restarted.exited)[0]).toBe(2)
    expect(restarted.output()).not.toContain('claim\n')
    expect(await inspectEngineService({ root, identity })).toEqual({
      status: 'held',
      ready: false
    })
    expect(
      JSON.parse(await readFile(join(root, 'admission', 'state.json'), 'utf8'))
        .phase
    ).toBe('active')
    expect(await readdir(join(root, 'attempts'))).toHaveLength(1)
  })
  it.each(['cooperative', 'noncooperative'])(
    'handles actual SIGTERM with %s cleanup and no second job',
    async (mode) => {
      const running = launch(mode)
      await running.waitFor('native-started')
      running.child.kill('SIGTERM')
      expect((await running.exited)[0]).toBe(mode === 'cooperative' ? 0 : 2)
      expect(running.output().match(/claim\n/g)).toHaveLength(1)
      expect(running.output()).toContain(
        mode === 'cooperative' ? 'stopped' : 'worker-uncertain'
      )
      expect(await inspectEngineService({ root, identity })).toEqual({
        status: mode === 'cooperative' ? 'available' : 'held',
        ready: false
      })
      expect(running.errors()).toBe('')
    }
  )
  it.each([{ args: ['--help'] }, { args: [] as string[] }])(
    'CLI is safe without enablement for %s',
    async ({ args }) => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve('scripts/banner-studio/engine-service.ts'),
          ...args
        ],
        {
          env: {
            ...process.env,
            BANNER_ENGINE_SERVICE_ENABLED: '',
            BANNER_ENGINE_ENABLED: '',
            BANNER_ENGINE_SERVICE_TOKEN: ''
          },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
      children.push(child)
      let output = '',
        errors = ''
      child.stdout!.on('data', (chunk) => {
        output += String(chunk)
      })
      child.stderr!.on('data', (chunk) => {
        errors += String(chunk)
      })
      expect((await once(child, 'exit'))[0]).toBe(0)
      expect(errors).toBe('')
      expect(output).toContain(args.includes('--help') ? 'Usage:' : 'disabled')
      expect(await readdir(root)).toEqual(['attempts', 'staging'])
    }
  )
  it.each([false, true])(
    'CLI status and enabled bad configuration remain content-free (enabled=%s)',
    async (enabled) => {
      const args = [
        '--root',
        root,
        '--root-device',
        String(identity.device),
        '--root-inode',
        String(identity.inode)
      ]
      if (!enabled) args.push('--status')
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve('scripts/banner-studio/engine-service.ts'),
          ...args
        ],
        {
          env: {
            ...process.env,
            BANNER_ENGINE_SERVICE_ENABLED: enabled ? 'true' : '',
            BANNER_ENGINE_ENABLED: enabled ? 'true' : '',
            BANNER_ENGINE_SERVICE_TOKEN: 'fixture-secret-token-'.repeat(3)
          },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
      children.push(child)
      let output = '',
        errors = ''
      child.stdout!.on('data', (chunk) => {
        output += String(chunk)
      })
      child.stderr!.on('data', (chunk) => {
        errors += String(chunk)
      })
      expect((await once(child, 'exit'))[0]).toBe(enabled ? 2 : 0)
      expect(JSON.parse(output)).toEqual(
        enabled
          ? { status: 'held', reason: 'configuration-invalid' }
          : { status: 'available', ready: false }
      )
      expect(errors).toBe('')
      expect(await inspectEngineService({ root, identity })).toEqual({
        status: enabled ? 'held' : 'available',
        ready: false
      })
    }
  )
})
