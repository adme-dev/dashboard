/**
 * MCP Server Phase 1 — explicit consent screen (mcp-server-phase1 spec §3, TODO A refinement).
 *
 * Before the app mints an identity assertion for an external AI host, the logged-in user explicitly
 * approves the grant (the OAuth consent step — what Salesforce/Heroku do). PURE HTML builder so the
 * security-relevant part (escaping — these values flow into markup) is unit-tested. No framework: the
 * /api/mcp/authorize handler returns this string directly.
 */

/** Escape for use in both text nodes and double-quoted attributes. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface ConsentPageOpts {
  userName: string
  /** URL that re-enters /authorize with consent granted, READ-ONLY (preserves redirect_uri + state). */
  allowUrl: string
  /** URL that re-enters /authorize with consent granted + write=granted (read + write / mcp:write). */
  allowWriteUrl: string
  /** URL to bounce to on denial (the OAuth client's redirect_uri with error=access_denied). */
  cancelUrl: string
}

export function buildConsentHtml({ userName, allowUrl, allowWriteUrl, cancelUrl }: ConsentPageOpts): string {
  const name = esc(userName)
  const allow = esc(allowUrl)
  const allowWrite = esc(allowWriteUrl)
  const cancel = esc(cancelUrl)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect your AI assistant — XeroFlow</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;background:#0a0b0e;color:#e7e9ee;display:grid;place-items:center;min-height:100vh;margin:0}
  .card{max-width:30rem;background:#15171c;border:1px solid #262a33;border-radius:14px;padding:2rem;margin:1rem}
  h1{font-size:1.15rem;margin:0 0 .5rem} p{color:#aeb4c0;margin:.5rem 0}
  ul{color:#aeb4c0;padding-left:1.1rem} li{margin:.25rem 0}
  .warn{color:#f0b357;font-size:.92rem;margin-top:1rem}
  .row{display:flex;flex-direction:column;gap:.6rem;margin-top:1.5rem}
  a.btn{text-align:center;text-decoration:none;padding:.7rem 1rem;border-radius:10px;font-weight:600}
  .allow{background:#3b82f6;color:#fff} .allow-write{background:#b45309;color:#fff}
  .cancel{background:transparent;color:#aeb4c0;border:1px solid #363b45}
</style></head><body>
<div class="card">
  <h1>Connect your AI assistant?</h1>
  <p>Signed in as <strong>${name}</strong>.</p>
  <p>Your external AI assistant can be granted access to XeroFlow:</p>
  <ul>
    <li>Access is revalidated for the signed-in account on every request.</li>
    <li><strong>Read-only</strong>: it can read and analyse, but cannot create, edit, approve or sign anything.</li>
    <li><strong>Read + write</strong>: it can prepare changes, including financial actions. For ordinary users, confirmation and money-mover acknowledgement controls remain in force. Freshly revalidated active owners using Owner God Mode may execute registered capabilities directly.</li>
    <li>Owner God Mode never bypasses authentication and session validity, exact active-owner status, tenant, client and entity isolation, immutable audit, emergency disable, provider, binding and secret availability, or SSRF protections.</li>
    <li>You can disconnect any time from your AI host.</li>
  </ul>
  <p class="warn">Only grant write access to assistants you trust to act on your behalf.</p>
  <div class="row">
    <a class="btn allow" href="${allow}">Allow read-only access</a>
    <a class="btn allow-write" href="${allowWrite}">Allow read + write access</a>
    <a class="btn cancel" href="${cancel}">Cancel</a>
  </div>
</div></body></html>`
}
