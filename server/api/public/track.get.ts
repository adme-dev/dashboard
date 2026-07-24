/**
 * Human-readable status page for browsers opening the event collection URL.
 *
 * This handler deliberately ignores the write-key query parameter. GET never
 * validates a tenant, returns account data, or participates in event ingestion.
 */
export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  })
  setResponseStatus(event, 200)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>XeroFlow Tracking Endpoint</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; color: #f5f7f7; background: #101313; }
    main { width: min(640px, 100%); padding: clamp(28px, 6vw, 52px); border: 1px solid #2a3432; border-radius: 20px; background: #171b1a; box-shadow: 0 24px 80px rgba(0, 0, 0, .35); }
    .status { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 22px; color: #75e6b4; font-size: 14px; font-weight: 650; }
    .status::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: currentColor; box-shadow: 0 0 18px currentColor; }
    h1 { margin: 0 0 18px; font-size: clamp(30px, 6vw, 48px); line-height: 1.05; letter-spacing: -.035em; }
    p { margin: 0 0 16px; color: #b6c0bd; font-size: 16px; line-height: 1.65; }
    .notice { margin-top: 26px; padding-top: 22px; border-top: 1px solid #2a3432; font-size: 14px; }
    a { color: #75e6b4; text-underline-offset: 3px; }
    a:focus-visible { outline: 2px solid #75e6b4; outline-offset: 4px; border-radius: 2px; }
  </style>
</head>
<body>
  <main>
    <div class="status">Endpoint operational</div>
    <h1>XeroFlow Tracking Endpoint</h1>
    <p>This machine endpoint receives website interaction events from authorised websites. It is not a form or a page intended to accept information directly.</p>
    <p>Opening this address in a browser does not submit an event or display any tracking key, account details, or collected data.</p>
    <p class="notice">Data handling is governed by the website owner's consent configuration and the <a href="/privacy">XeroFlow Privacy Policy</a>. If you arrived here unexpectedly, you can safely close this page.</p>
  </main>
</body>
</html>`
})
