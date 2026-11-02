// Navigation only: both frames retain their existing authentication and writers.
// The canvas remains mounted when the library is selected, preserving local work.
export const STANDALONE_INDEX = '/figflow/0.11.2-flow1/'
export const LIBRARY_SHELL = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FigFlow — XeroFlow</title>
<style>
:root{color-scheme:dark;font:14px system-ui,sans-serif;background:#18181b;color:#fafafa}*{box-sizing:border-box}body{margin:0;height:100svh;display:flex;flex-direction:column}nav{height:48px;flex:none;display:flex;align-items:center;gap:6px;padding:0 16px;border-bottom:1px solid #3f3f46}nav strong{margin-right:16px;font-weight:600}a{color:inherit;text-decoration:none;padding:7px 12px;border-radius:6px}a:hover{background:#303034}a:focus-visible{outline:2px solid #00dc82;outline-offset:2px}main{position:relative;flex:1;min-height:0}section{position:absolute;inset:0}iframe{display:block;border:0;width:100%;height:100%}#email-templates{visibility:hidden}#email-templates:target{visibility:visible}body:has(#email-templates:target) #canvas{visibility:hidden}body:not(:has(#email-templates:target)) a[href="#canvas"],body:has(#email-templates:target) a[href="#email-templates"]{background:#303034}nav a:last-child{margin-left:auto;color:#a1a1aa}@media(max-width:480px){nav{padding:0 6px;gap:2px}nav strong{margin-right:2px}a{padding:7px}nav a:last-child{display:none}}
</style></head><body>
<nav aria-label="FigFlow workspaces"><strong>FigFlow</strong><a href="#canvas">Canvas</a><a href="#email-templates">Email templates</a><a href="https://creative.xeroflow.io/">Creative Suite</a></nav>
<main><section id="canvas" aria-label="Design canvas"><iframe src="${STANDALONE_INDEX}?canvas=1" title="FigFlow canvas" referrerpolicy="no-referrer"></iframe></section>
<section id="email-templates" aria-label="Email template browser"><iframe src="https://app.xeroflow.io/agency/email?tab=templates&amp;workspace=figflow" title="Email templates" loading="lazy" referrerpolicy="no-referrer"></iframe></section></main>
</body></html>`
