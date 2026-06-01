// server/utils/socialReporting/pdf.ts
// Render report HTML → PDF via Cloudflare Browser Rendering (same binding as banner-studio export).
// Returns null when the BROWSER binding isn't available (local dev / not provisioned) so callers
// degrade gracefully (e.g. attach/serve the HTML instead). JS is disabled — the report is static.
import type { H3Event } from 'h3'

export async function renderReportPdf(event: H3Event, html: string): Promise<Buffer | null> {
  const cfBrowser = (event.context as any).cloudflare?.env?.BROWSER
  if (!cfBrowser) return null
  let browser: any
  try {
    const puppeteer = await import('@cloudflare/puppeteer' as string)
    browser = await puppeteer.default.launch(cfBrowser)
    const page = await browser.newPage()
    try {
      await page.setJavaScriptEnabled(false)
      await page.setContent(html, { waitUntil: 'load', timeout: 10000 })
      await new Promise(r => setTimeout(r, 300)) // let fonts settle
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } })
      return Buffer.from(pdf)
    } finally {
      await page.close().catch(() => {})
    }
  } catch {
    return null
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
