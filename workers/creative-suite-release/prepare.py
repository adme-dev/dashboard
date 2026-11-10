"""Prepare an additive private asset service and current gateway candidate; no upload."""
from pathlib import Path
import argparse, hashlib, json, shutil, re
HERE = Path(__file__).resolve().parent
BASE_HASHES = {'worker.js':'97d2daacca6aae1d77baadb33b24b66590e5bf26e7cf32d4723a340750c416ca','brand-rpc.mjs':'0787e4c0acb8e2507a8d14f438a977941334212e95e0e490863b71a9812882c2'}
STAGE_HASHES = {'stored-assets.json': 'd5141f7b159584b53f0a262dc8f276034130404a22f7cd3adf84aef1c7bea5bd', 'stage-receipt.json': '6fad6a18b82f2d81111e3bcead15fc0f47cc62adab0046101e7248ff8dddb410', 'compressed.json': 'c4bb3944652054ecb1cb6d54a09086def8d0ac1c48ed326b6a7ed31a7714d9b7'}
RETIRE = """// Retire this registration without deleting any origin cache or document storage.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.registration.unregister()))
"""
def digest(data): return hashlib.sha256(data).hexdigest()
def write(path, data): path.write_text(json.dumps(data,indent=2)+'\n')
def prepare(stage, output, shell, gateway):
    stage,output,shell,gateway=map(Path,(stage,output,shell,gateway))
    if not output.is_absolute() or output != output.resolve() or output.exists(): raise ValueError('Fresh absolute output required')
    for name,expected in STAGE_HASHES.items():
        source=stage/name
        if source.is_symlink() or digest(source.read_bytes())!=expected:raise ValueError('Stage metadata drift')
    manifest=json.loads((stage/'stored-assets.json').read_text())
    for url,pin in manifest.items():
        p=stage/'public'/url.lstrip('/')
        if p.is_symlink() or not p.resolve().is_relative_to((stage/'public').resolve()) or digest(p.read_bytes())!=pin['sha256']:raise ValueError('Stage changed')
    modules={name:(gateway/name).read_bytes() for name in BASE_HASHES}
    if {n:digest(b) for n,b in modules.items()}!=BASE_HASHES:raise ValueError('Current gateway baseline changed')
    inputs=json.loads((stage/'stage-receipt.json').read_text())['inputs']
    if output.is_relative_to(stage.resolve()) or stage.resolve().is_relative_to(output): raise ValueError('Output overlaps source')
    output.mkdir()
    public=output/'public';public.mkdir()
    for url in manifest:
        source=stage/'public'/url.lstrip('/')
        target=public/url.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
    prefixes=[];shell_pins={}
    files=['editor-dock.css','editor-dock.js','asset-library.js','asset-library.css','auth-session.js','install-app.js','install-app.css','xeroflow-logo.svg','xeroflow-icon-192.png','xeroflow-icon-512.png','xeroflow-maskable-512.png','apple-touch-icon.png']
    source_pins=json.loads((HERE/'shell-source-pins.json').read_text())
    for filename,expected in source_pins.items():
        source=shell/filename
        if source.is_symlink() or digest(source.read_bytes())!=expected:raise ValueError('Shell source drift')
    for item in inputs:
        prefix=item['entry'].removesuffix('index.html');prefixes.append(prefix);directory=public/prefix.lstrip('/')
        local=directory/'xf-shell';local.mkdir()
        for name in files:
            data=(shell/name).read_bytes();shell_pins[name]=digest(data)
            # Library dynamically creates its stylesheet link. Keep it in this immutable shell.
            if name=='asset-library.js': data=data.replace(b'"/asset-library.css"',json.dumps(prefix+'xf-shell/asset-library.css').encode())
            (local/name).write_bytes(data)
        name=item['engine'].replace('craft','flow');display=name[:-4].capitalize()+'Flow'
        page=directory/'index.html';html=page.read_text()
        html=re.sub(r'<link\b(?=[^>]*\brel=["\'](?:manifest|icon|shortcut icon|apple-touch-icon)["\'])[^>]*>\s*','',html,flags=re.I)
        tags=['<!-- xeroflow-app-support:start -->','<link rel="icon" href="./xf-shell/xeroflow-logo.svg">','<link rel="manifest" href="./manifest.webmanifest">','<link rel="apple-touch-icon" href="./xf-shell/apple-touch-icon.png">','<meta name="mobile-web-app-capable" content="yes">','<meta name="apple-mobile-web-app-capable" content="yes">',f'<meta name="apple-mobile-web-app-title" content="{display}">']
        for resource in ['editor-dock.css','install-app.css']:tags.append(f'<link rel="stylesheet" href="./xf-shell/{resource}">')
        for resource in ['editor-dock.js','install-app.js','auth-session.js','asset-library.js']:tags.append(f'<script type="module" src="./xf-shell/{resource}"></script>')
        tags.append('<!-- xeroflow-app-support:end -->')
        if html.count('</head>')!=1:raise ValueError('Unexpected editor shell')
        page.write_text(html.replace('</head>','\n'.join(tags)+'\n</head>'))
        # Stable installed-app identity remains unchanged; candidate URL is not promoted automatically.
        write(directory/'manifest.webmanifest',{'id':f'/{name}/','name':display,'short_name':display,'start_url':f'/{name}/','scope':f'/{name}/','display':'standalone','background_color':'#1b1b1e','theme_color':'#1b1b1e','icons':[{'src':'./xf-shell/xeroflow-icon-192.png','sizes':'192x192','type':'image/png'},{'src':'./xf-shell/xeroflow-icon-512.png','sizes':'512x512','type':'image/png'}]})
        if (directory/'sw.js').exists():(directory/'sw.js').write_text(RETIRE)
    compressed=json.loads((stage/'compressed.json').read_text());inventory={}
    for path in public.rglob('*'):
        if path.is_symlink():raise ValueError('Linked asset')
        if path.is_file():
            data=path.read_bytes()
            if len(data)>=25*1024**2:raise ValueError('Oversized asset')
            inventory['/'+str(path.relative_to(public))]={'bytes':len(data),'sha256':digest(data)}
    write(output/'inventory.json',inventory);write(output/'compressed.json',compressed)
    shutil.copyfile(HERE/'assets-worker.mjs',output/'assets-worker.mjs')
    write(output/'wrangler.jsonc',{'name':'xeroflow-creative-standalone-assets','account_id':'a5b299b3ad15c1b5b895dc66f9357b17','main':'assets-worker.mjs','compatibility_date':'2026-10-27','workers_dev':False,'preview_urls':False,'routes':[],'assets':{'directory':'./public','binding':'ASSETS','run_worker_first':True}})
    worker=modules['worker.js'].decode()
    definition='const standalonePrefixes = '+json.dumps(prefixes)+';\nconst isStandalone = path => standalonePrefixes.some(prefix => path.startsWith(prefix));\n'
    worker=definition+worker
    anchor='if (url.pathname.endsWith("/sw.js")) {'
    if worker.count(anchor)!=1:raise ValueError('SW anchor drift')
    worker=worker.replace(anchor,'if (url.pathname.endsWith("/sw.js") && !isStandalone(url.pathname)) {')
    anchor='    const assetsResponse = await handleMotorstack(request, env);'
    if worker.count(anchor)!=1:raise ValueError('Authorized dispatch anchor drift')
    dispatch='''    if (url.hostname === "creative.xeroflow.io" && isStandalone(url.pathname)) {
      if (!env.CREATIVE_STANDALONE_ASSETS) return blocked(503, "Creative editor unavailable", false);
      try {
        return await env.CREATIVE_STANDALONE_ASSETS.fetch(new Request(url, { method: request.method }));
      } catch { return blocked(503, "Creative editor unavailable", false); }
    }
'''
    worker=worker.replace(anchor,dispatch+anchor)
    out=output/'gateway';out.mkdir();(out/'worker.js').write_text(worker);(out/'brand-rpc.mjs').write_bytes(modules['brand-rpc.mjs'])
    write(output/'release-receipt.json',{'status':'prepared-unpublished-additive-candidate','assets':len(inventory),'prefixes':prefixes,'shell_inputs':shell_pins,'baseline_modules':BASE_HASHES,'modules':{n:digest((out/n).read_bytes()) for n in BASE_HASHES},'service_files':{n:digest((output/n).read_bytes()) for n in ['assets-worker.mjs','wrangler.jsonc','inventory.json','compressed.json']},'compressed_decoded':{url:{'sha256':manifest[target]['decoded_sha256'],'bytes':manifest[target]['decoded_bytes']} for url,target in compressed.items()},'keep_assets':True,'stable_routes_changed':False,'new_binding':{'name':'CREATIVE_STANDALONE_ASSETS','type':'service','service':'xeroflow-creative-standalone-assets','environment':'production'},'preserve_bindings':['ASSETS','CREATIVE_AUTH_KEY','MOTORSTACK_API_KEY','FIGFLOW_EDM_ASSETS'],'browser_acceptance':False})
    return output
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--stage',required=True);p.add_argument('--output',required=True);p.add_argument('--shell',required=True);p.add_argument('--gateway',required=True);a=p.parse_args();print(prepare(a.stage,a.output,a.shell,a.gateway))
