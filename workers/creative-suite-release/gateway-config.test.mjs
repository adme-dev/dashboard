import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { releaseConfig,validateGatewayState } from './prepare-gateway.mjs'
const baseline=JSON.parse(readFileSync(new URL('./gateway-baseline.json',import.meta.url)))
function fixture(){return [[{id:baseline.deployment,created_on:'2026-11-08',versions:[{version_id:baseline.version,percentage:100}]}],[{id:baseline.version,metadata:{created_on:'2026-11-08'}}],{id:baseline.version,resources:{script:{etag:baseline.etag},script_runtime:structuredClone(baseline.runtime),bindings:structuredClone(baseline.bindings)}}]}
test('fresh active/latest/runtime/binding reconciliation preserves all baseline resources',()=>{validateGatewayState(...fixture());const x=releaseConfig('a'.repeat(40));assert.equal(x.unsafe.metadata.keep_assets,true);assert.equal(x.assets,undefined);assert.equal(x.unsafe.metadata.bindings.length,5);assert.deepEqual(x.unsafe.metadata.bindings.slice(0,4),baseline.bindings.map(({name})=>({name,type:'inherit'})));assert.equal(x.unsafe.metadata.bindings[4].service,'xeroflow-creative-standalone-assets')})
test('unknown active/latest uploads, bindings and assets changes fail closed',()=>{for(const change of [x=>x[0][0].id='new',x=>x[1][0].id='new',x=>x[2].resources.bindings.pop(),x=>x[2].resources.script_runtime.assets.base_path='/changed']){const x=fixture();change(x);assert.throws(()=>validateGatewayState(...x))}})
