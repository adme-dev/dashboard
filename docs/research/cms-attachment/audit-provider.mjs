// Read-only retained-state audit. Never creates resources or activates routes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
const account='a5b299b3ad15c1b5b895dc66f9357b17';
const token=(await readFile(process.env.CMS_AUDIT_WRANGLER_CONFIG ?? path.join(homedir(),'Library/Preferences/.wrangler/config/default.toml'),'utf8')).match(/^oauth_token\s*=\s*"([^"\n]+)"/m)?.[1];assert(token);
async function api(path,body){
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 assert(r.ok,`Provider HTTP ${r.status}`);const data=await r.json();assert(data.success);return data.result;
}
const sites=['c34f6347-cc63-4ed7-9a5a-da165ebefed2','a27135dc-1374-475c-a56d-7e60310425bb'];
const report={at:new Date().toISOString(),sites,environments:{}};
const project=await api('pages/projects/agency-dashboard');
for(const environment of ['staging','production']){
 const settings=await api(`workers/scripts/xeroflow-provisioning-${environment}/settings`);
 const binding=settings.bindings.find(b=>b.type==='d1'&&b.name==='PROVISIONING_DB');
 assert(binding,'Missing provisioning D1 binding');
 const id=binding.id;
 assert(/^[a-f0-9-]{36}$/.test(id));
 const jobs=await api(`d1/database/${id}/query`,{sql:`SELECT scope_key, job_id, request_key, phase, updated_at,
 json_extract(payload,'$.scope.siteId') AS site_id,
 json_extract(payload,'$.scope.environment') AS environment,
 json_type(payload,'$.setup') IS NOT NULL AS has_setup,
 json_type(payload,'$.actor.loginSessionHash') IS NOT NULL AS has_login_session,
 json_extract(payload,'$.resources.database') AS database_id,
 json_extract(payload,'$.resources.contentBinding') AS content_binding
 FROM provisioning_jobs WHERE json_extract(payload,'$.scope.siteId') IN (?,?) ORDER BY updated_at`,params:sites});
 assert(jobs.every(r=>r.success&&r.meta.rows_written===0));
 const resources={};
 for(const [name,sql] of Object.entries({
 routes:'SELECT scope_key,activation_id,job_id,request_key,state,updated_at FROM provisioning_content_routes',
 databases:'SELECT scope_key,database_id,state,updated_at FROM provisioning_content_databases',
 workers:'SELECT scope_key,namespace,script_name,database_id,state,updated_at FROM provisioning_content_workers'
 })){
  const result=await api(`d1/database/${id}/query`,{sql:sql+" WHERE json_extract(scope_key,'$[3]') IN (?,?)",params:sites});
  assert(result.every(r=>r.success&&r.meta.rows_written===0));resources[name]=result.flatMap(r=>r.results);
 }
 const config=project.deployment_configs[environment==='staging'?'preview':'production'];
 const envValue=config.env_vars?.PAGE_STUDIO_CONTENT_ENVIRONMENT;
 report.environments[environment]={database:id,jobs:jobs.flatMap(r=>r.results),...resources,pagesContentEnvironment:envValue?.value,routerBinding:config.services?.PAGE_STUDIO_CONTENT_ROUTER};
}
await writeFile(path.resolve(process.env.CMS_AUDIT_OUTPUT ?? 'cms-storage-readback.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report,null,2));
