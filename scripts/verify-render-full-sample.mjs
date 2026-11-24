import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { buildCompositePlan } from '/app/videoCompositeGraph.mjs'
const dir = mkdtempSync(join(tmpdir(), 'audio-controls-full-'))
let logs = ''
const server = spawn(process.execPath, ['/app/server.mjs'], { stdio: ['ignore','pipe','pipe'] })
for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => { logs = (logs + bytes).slice(-12000) })
const ff = args => execFileSync('ffmpeg', ['-v','error','-threads','2','-filter_complex_threads','1','-y',...args], { timeout:120000, maxBuffer:16*1024*1024 })
try {
  for (let i=0; i<100; i++) { if (await fetch('http://127.0.0.1:8080/health').then(r=>r.ok).catch(()=>false)) break; await delay(100) }
  const duration = 40.18, fps = 30
  const video = join(dir,'source.mp4'), audio = join(dir,'voice.wav')
  ff(['-f','lavfi','-i',`color=red:s=1080x1920:r=30:d=${duration}`,'-vf',"drawbox=c=lime:t=fill:enable='gte(t,10)',drawbox=c=blue:t=fill:enable='gte(t,20)',drawbox=c=yellow:t=fill:enable='gte(t,30)',drawbox=x=100:y=400:w=200:h=200:c=white:t=fill",'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',video])
  ff(['-f','lavfi','-i',`aevalsrc=if(lt(mod(t\\,10)\\,0.15)\\,0.25*sin(2*PI*880*t)\\,0):s=48000:d=${duration}`,audio])
  const clip = {id:'art',type:'overlay',timeline_start_sec:0,duration_sec:duration}
  const source = {r2Key:'synthetic-source.mp4',zoom:[{timeSec:0,scale:1},{timeSec:duration,scale:1.05}]}
  const plan = buildCompositePlan({schema_version:2,media_type:'av',sample_rate:48000,tracks:[{kind:'overlay',clips:[clip]},{id:'voice',kind:'voiceover',gain_db:0,clips:[{id:'tone',gain_db:0,r2_key:'voice.wav',source_in_sec:0,source_out_sec:duration,timeline_start_sec:0}]}],ducking:[],master:{gain_db:0}}, {width:1080,height:1920,fps,videoBitrate:'4M'}, [{clipId:'art',framesPattern:'graphics/%05d.png',fps,timeline_start_sec:0,duration_sec:duration,baseFootage:source}])
  const text = 'Audio controls verification'
  const html = `<body style="margin:0;background:transparent"><div data-storyboard-copy-id="copy" style="position:absolute;top:40px;left:40px;right:40px;padding:24px;background:white;color:black;font:40px Arial">${text}</div></body>`
  const request = {plan,files:[{b64:readFileSync(video).toString('base64')},{b64:readFileSync(audio).toString('base64')}],overlays:[{clipId:'art',html,framesPattern:'graphics/%05d.png',fps,width:1080,height:1920,durationSec:duration,requiredCopy:[{clipId:'copy',text,startSec:0,durationSec:duration}]}]}
  const started=Date.now()
  const response=await fetch('http://127.0.0.1:8080/render-composite',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(610000)})
  const bytes=Buffer.from(await response.arrayBuffer())
  assert.equal(response.status,200,bytes.toString().slice(0,1000)+'\n'+logs)
  const elapsedMs=Date.now()-started
  assert.ok(elapsedMs<600000)
  const out=join(dir,'full.mp4');writeFileSync(out,bytes)
  const facts=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',out],{encoding:'utf8'}))
  ff(['-i',out,'-f','null','-'])
  const v=facts.streams.find(s=>s.codec_type==='video')
  assert.equal(v.width,1080);assert.equal(v.height,1920);assert.equal(Number(v.nb_frames),1206)
  const pictures=[]
  for(const [time,wanted] of [[1,'100'],[11,'010'],[21,'001'],[31,'110']]) {
    const pixel=ff(['-ss',String(time),'-i',out,'-frames:v','1','-vf','crop=2:2:540:960,scale=1:1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
    const actual=Array.from(pixel,c=>c>128?'1':'0').join('');assert.equal(actual,wanted);pictures.push({time,color:actual})
  }
  const zoomEdges=[]
  for (const time of [1,39]) {
    const row=ff(['-ss',String(time),'-i',out,'-frames:v','1','-vf','crop=400:2:0:500','-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
    const white=[]
    for(let x=0;x<400;x++) if(row[x*3]>220&&row[x*3+1]>220&&row[x*3+2]>220) white.push(x)
    assert.ok(white.length>180)
    zoomEdges.push({time,left:white[0],right:white.at(-1)})
  }
  assert.ok(zoomEdges[1].left<zoomEdges[0].left-10, 'encoded zoom follows the source clock')
  assert.ok(zoomEdges[1].right-zoomEdges[1].left>zoomEdges[0].right-zoomEdges[0].left+5, 'source marker expands during zoom')
  const pcm=ff(['-i',out,'-vn','-ar','48000','-ac','1','-f','f32le','pipe:1'])
  const onsets=[]
  for(const seconds of [10,20,30]) {
    let first=-1
    for(let n=Math.round((seconds-0.03)*48000);n<Math.round((seconds+0.05)*48000);n++) if(Math.abs(pcm.readFloatLE(n*4))>0.03){first=n/48000;break}
    assert.ok(first>=0 && Math.abs(first-seconds)<0.02);onsets.push(Math.round((first-seconds)*1000))
  }
  const receipt={kind:'synthetic-full-HD-composite',inputDurationSec:duration,outputDurationSec:Number(facts.format.duration),frames:Number(v.nb_frames),fps,width:v.width,height:v.height,elapsedMs,outputBytes:bytes.length,outputSha256:createHash('sha256').update(bytes).digest('hex'),fullDecode:'passed',pictureTiming:pictures,encodedZoomEdges:zoomEdges,voiceLagMs:onsets,copy:'measured readable',environment:'Linux amd64 emulation, 4 CPUs, 8 GiB Colima VM'}
  console.log(JSON.stringify(receipt))
} finally {server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true})}
