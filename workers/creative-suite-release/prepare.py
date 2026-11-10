"""Prepare an additive private asset service and current gateway candidate; no upload."""
from pathlib import Path
import argparse, hashlib, json, shutil, re
HERE = Path(__file__).resolve().parent
BASE_HASHES = {'worker.js':'97d2daacca6aae1d77baadb33b24b66590e5bf26e7cf32d4723a340750c416ca','brand-rpc.mjs':'0787e4c0acb8e2507a8d14f438a977941334212e95e0e490863b71a9812882c2'}
STAGE_HASHES = {'stored-assets.json': '1a967a084e05f528946c879dff7b3821955e8ea9aeb3daa7d2912fc79d0e8b51', 'stage-receipt.json': '3a4f68fda13abb616109fe66c9e72dc7a2f7cd57caf056558122b44004c50efa', 'compressed.json': '72ed2be65101fec88d5c209297cbb06c41894559361047f9e6a915d9ef4429b1'}
RETIRE = """// Retire this registration without deleting any origin cache or document storage.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.registration.unregister()))
"""
def digest(data): return hashlib.sha256(data).hexdigest()
def write(path, data): path.write_text(json.dumps(data,indent=2)+'\n')
LIBRARY_SOURCE_SHA = '65407a93b617d30f78ff0d775ff40249b021fdf367d1c74cb0625ed710ce293e'
def library_shell(prefix):
    source = (HERE.parent / 'figflow-edm-assets/library-shell.mjs').read_bytes()
    if digest(source) != LIBRARY_SOURCE_SHA:
        raise ValueError('Existing FigFlow library shell changed; reconcile')
    text = source.decode()
    match = re.search(r'export const LIBRARY_SHELL = `(.*)`\s*$', text, re.S)
    if not match or match[1].count('${STANDALONE_INDEX}') != 1:
        raise ValueError('Unexpected FigFlow library shell')
    # The only HTML change: retain the existing library/navigation/iframe behavior.
    return match[1].replace('${STANDALONE_INDEX}', prefix)

def personalise_loading(html, engine):
    # Preserve the existing brand_package.py pseudo-element: it survives Photo's progress text.
    loading = 'loading' if engine in ('effectcraft', 'filmcraft') else engine + '_loading'
    if f'id="{loading}"' not in html:
        raise ValueError('Unknown editor loading screen: ' + engine)
    style = f'''<style id="xeroflow-loading-brand">
#{loading} > img {{ display: none !important; }}
#{loading}::before {{ content: ""; display: block; flex: 0 0 56px; width: 56px; height: 56px; margin: 0 auto 16px; background: url("./xf-shell/xeroflow-logo.svg") center / contain no-repeat; }}
</style>'''
    html = re.sub(r'<style id="xeroflow-loading-brand">.*?</style>', '', html, flags=re.S)
    if html.count('</head>') != 1:
        raise ValueError('Unexpected editor head')
    return html.replace('</head>', style + '\n</head>')

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
    prefixes=[];shell_pins={};fig_library={};promoted_routes={}
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
        for stable in ['/'+name, '/'+name+'/']: promoted_routes[stable]=prefix
        if item['engine']=='figcraft':
            (local/'library.html').write_text(library_shell(prefix))
            fig_library={'index':prefix+'index.html','library':prefix+'xf-shell/library.html'}
        page=directory/'index.html';html=personalise_loading(page.read_text(), item['engine'])
        html=re.sub(r'<meta\b(?=[^>]*\bname=["\'](?:theme-color|apple-mobile-web-app-capable|mobile-web-app-capable|apple-mobile-web-app-title)["\'])[^>]*>\s*','',html,flags=re.I)
        html=re.sub(r'<link\b(?=[^>]*\brel=["\'](?:manifest|icon|shortcut icon|apple-touch-icon)["\'])[^>]*>\s*','',html,flags=re.I)
        tags=['<!-- xeroflow-app-support:start -->','<link rel="icon" href="./xf-shell/xeroflow-logo.svg">','<link rel="manifest" href="./manifest.webmanifest">','<link rel="apple-touch-icon" href="./xf-shell/apple-touch-icon.png">','<meta name="theme-color" content="#1b1b1e">','<meta name="mobile-web-app-capable" content="yes">','<meta name="apple-mobile-web-app-capable" content="yes">',f'<meta name="apple-mobile-web-app-title" content="{display}">']
        for resource in ['editor-dock.css','install-app.css']:tags.append(f'<link rel="stylesheet" href="./xf-shell/{resource}">')
        for resource in ['editor-dock.js','install-app.js','auth-session.js','asset-library.js']:tags.append(f'<script type="module" src="./xf-shell/{resource}"></script>')
        tags.append('<!-- xeroflow-app-support:end -->')
        if html.count('</head>')!=1:raise ValueError('Unexpected editor shell')
        page.write_text(html.replace('</head>','\n'.join(tags)+'\n</head>'))
        # Stable installed-app identity remains unchanged; candidate URL is not promoted automatically.
        write(directory/'manifest.webmanifest',{'id':f'/{name}/','name':display,'short_name':display,'start_url':f'/{name}/','scope':f'/{name}/','display':'standalone','background_color':'#1b1b1e','theme_color':'#1b1b1e','icons':[{'src':'./xf-shell/xeroflow-icon-192.png','sizes':'192x192','type':'image/png','purpose':'any'},{'src':'./xf-shell/xeroflow-icon-512.png','sizes':'512x512','type':'image/png','purpose':'any'},{'src':'./xf-shell/xeroflow-maskable-512.png','sizes':'512x512','type':'image/png','purpose':'maskable'}]})
        if (directory/'sw.js').exists():(directory/'sw.js').write_text(RETIRE)
    compressed=json.loads((stage/'compressed.json').read_text());inventory={}
    for path in public.rglob('*'):
        if path.is_symlink():raise ValueError('Linked asset')
        if path.is_file():
            data=path.read_bytes()
            if len(data)>=25*1024**2:raise ValueError('Oversized asset')
            inventory['/'+str(path.relative_to(public))]={'bytes':len(data),'sha256':digest(data)}
    write(output/'inventory.json',inventory);write(output/'compressed.json',compressed);write(output/'fig-library.json',fig_library)
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
    promotion = output/'promotion';promotion.mkdir()
    # Only the canonical online suite changes selection. Legacy origins retain their old routes.
    anchor = '    if (Object.hasOwn(app_routes_default, url.pathname)) {'
    if worker.count(anchor)!=1:raise ValueError('Stable route anchor drift')
    new_routes = '    if (url.hostname === "creative.xeroflow.io" && Object.hasOwn(promotedStableRoutes, url.pathname)) {\n      url.pathname = promotedStableRoutes[url.pathname];\n      return new Response(null, {status:302, headers:{Location:url.href, "Cache-Control":"private, no-store", "Referrer-Policy":"no-referrer"}});\n    }\n'
    promoted_worker = 'const promotedStableRoutes = '+json.dumps(promoted_routes)+';\n'+worker.replace(anchor,new_routes+anchor)
    (promotion/'worker.js').write_text(promoted_worker);(promotion/'brand-rpc.mjs').write_bytes(modules['brand-rpc.mjs'])
    promotion_modules={n:digest((promotion/n).read_bytes()) for n in BASE_HASHES}
    write(output/'promotion-receipt.json',{'status':'prepared-unpublished-stable-route-promotion','canonical_host':'creative.xeroflow.io','routes':promoted_routes,'modules':promotion_modules,'baseline_modules':BASE_HASHES,'fig_library_source_sha256':LIBRARY_SOURCE_SHA,'keep_assets':True,'hosted_acceptance_required':True})
    write(output/'release-receipt.json',{'status':'prepared-unpublished-additive-candidate','assets':len(inventory),'prefixes':prefixes,'shell_inputs':shell_pins,'baseline_modules':BASE_HASHES,'modules':{n:digest((out/n).read_bytes()) for n in BASE_HASHES},'promotion_modules':promotion_modules,'promotion_receipt_sha256':digest((output/'promotion-receipt.json').read_bytes()),'service_files':{n:digest((output/n).read_bytes()) for n in ['assets-worker.mjs','wrangler.jsonc','inventory.json','compressed.json','fig-library.json']},'compressed_decoded':{url:{'sha256':manifest[target]['decoded_sha256'],'bytes':manifest[target]['decoded_bytes']} for url,target in compressed.items()},'keep_assets':True,'stable_routes_changed':False,'new_binding':{'name':'CREATIVE_STANDALONE_ASSETS','type':'service','service':'xeroflow-creative-standalone-assets','environment':'production'},'preserve_bindings':['ASSETS','CREATIVE_AUTH_KEY','MOTORSTACK_API_KEY','FIGFLOW_EDM_ASSETS'],'browser_acceptance':False})
    return output
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--stage',required=True);p.add_argument('--output',required=True);p.add_argument('--shell',required=True);p.add_argument('--gateway',required=True);a=p.parse_args();print(prepare(a.stage,a.output,a.shell,a.gateway))
