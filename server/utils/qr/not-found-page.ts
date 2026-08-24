export function qrNotFoundPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Link not available</title>
<style>:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#101313;color:#f5f7f7}main{width:min(560px,100%);padding:40px;border:1px solid #2a3432;border-radius:20px;background:#171b1a}h1{margin:0 0 12px;font-size:28px;letter-spacing:-.02em}p{margin:0;color:#b6c0bd;line-height:1.6}</style></head>
<body><main><h1>This QR code is no longer active</h1><p>The link behind this code has been switched off or does not exist. If you scanned it from printed material, please contact the business that issued it.</p></main></body></html>`
}
