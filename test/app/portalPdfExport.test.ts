import { existsSync, readFileSync } from 'node:fs'
import { chromium, type Browser } from 'playwright'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it } from 'vitest'

const layoutSource = readFileSync('app/layouts/portal.vue', 'utf8')
const analyticsSource = readFileSync('app/pages/portal/analytics/index.vue', 'utf8')
const printReportPath = 'app/components/analytics/PortalAnalyticsPrintReport.vue'
const printReportSource = existsSync(printReportPath) ? readFileSync(printReportPath, 'utf8') : ''

function classesForTag(source: string, tagPattern: RegExp): string {
  const tag = source.match(tagPattern)?.[0] || ''
  return tag.match(/class="([^"]*)"/)?.[1] || ''
}

function componentStyles(source: string): string {
  return Array.from(source.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g), match => match[1]).join('\n')
}

const shellClasses = classesForTag(layoutSource, /<UDashboardGroup\b[^>]*>/s)
const contentClasses = classesForTag(layoutSource, /<div\s+class="flex-1 w-full[^>]*>/s)
const reportGridClasses = classesForTag(analyticsSource, /<!-- Main content \+ Sidebar -->\s*<div\b[^>]*>/s)
const printStyles = [componentStyles(layoutSource), componentStyles(analyticsSource)].join('\n')
const dedicatedPrintStyles = componentStyles(printReportSource)

let browser: Browser | undefined

afterEach(async () => {
  await browser?.close()
  browser = undefined
})

describe('portal analytics PDF export', () => {
  it('defines a dedicated report with no interactive dashboard controls', () => {
    expect(printReportSource).toContain('Executive summary')
    expect(printReportSource).toContain('Campaign performance')
    expect(printReportSource).toContain('Website &amp; funnel performance')
    expect(printReportSource).toContain('Audience &amp; identity insights')
    expect(printReportSource).not.toMatch(/<U(Button|Input|Select|SelectMenu|Checkbox|Popover)\b/)
  })

  it('lays out a complete multi-page A4 portrait report without horizontal overflow', async () => {
    try {
      browser = await chromium.launch({ headless: true })
    } catch (error) {
      if (!String(error).includes('Executable doesn\'t exist')) throw error
      browser = await chromium.launch({ channel: 'chrome', headless: true })
    }

    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
    const campaignRows = Array.from({ length: 42 }, (_, index) => `
      <tr><td>Long campaign name ${index + 1} with printable wrapping</td><td>Google Ads</td><td>$208.46</td><td>19,800</td><td>415</td><td>${index + 1}</td></tr>
    `).join('')

    await page.setContent(`
      <!doctype html>
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; }
        ${dedicatedPrintStyles}
      </style>
      <main class="portal-analytics-print-report">
        <header><h1>Executive summary</h1><p>7 July 2026 to 7 August 2026</p></header>
        <div class="print-kpi-grid">
          ${Array.from({ length: 8 }, (_, index) => `<section class="print-card"><strong>KPI ${index + 1}</strong><p>19,800</p></section>`).join('')}
        </div>
        <div class="print-two-column"><section class="print-card">Trend chart</section><section class="print-card">Platform summary</section></div>
        <section class="print-section"><h2>Campaign performance</h2><table class="print-table"><thead><tr><th>Campaign</th><th>Platform</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>Leads</th></tr></thead><tbody>${campaignRows}</tbody></table></section>
        <section class="print-section"><h2>Lead &amp; outcome performance</h2><div class="print-two-column"><div class="print-card">Lead health</div><div class="print-card">Lead progression</div></div></section>
        <section class="print-section"><h2>Website &amp; funnel performance</h2><p class="print-wrap">https://example.com/a/very/long/landing/page/url/that/must/wrap/inside/the/printable/report/without/overflow</p>${Array.from({ length: 16 }, (_, index) => `<div class="print-card">Website detail ${index + 1}</div>`).join('')}</section>
        <section class="print-section"><h2>Audience &amp; identity insights</h2><p>FINAL AUDIENCE SECTION</p></section>
      </main>
    `)
    await page.emulateMedia({ media: 'print' })

    const layout = await page.evaluate(() => {
      const report = document.querySelector<HTMLElement>('.portal-analytics-print-report')!
      const kpis = document.querySelector<HTMLElement>('.print-kpi-grid')!
      const columns = document.querySelector<HTMLElement>('.print-two-column')!
      return {
        overflow: report.scrollWidth - report.clientWidth,
        kpiColumns: getComputedStyle(kpis).gridTemplateColumns.split(' ').length,
        sectionColumns: getComputedStyle(columns).gridTemplateColumns.split(' ').length
      }
    })
    expect(layout.overflow).toBeLessThanOrEqual(1)
    expect(layout.kpiColumns).toBe(4)
    expect(layout.sectionColumns).toBe(2)

    const pdf = await page.pdf({ format: 'A4', landscape: false, printBackground: true })
    const pdfDocument = await getDocument({ data: new Uint8Array(pdf) }).promise
    const firstViewport = (await pdfDocument.getPage(1)).getViewport({ scale: 1 })
    expect(firstViewport.height).toBeGreaterThan(firstViewport.width)
    expect(pdfDocument.numPages).toBeGreaterThan(2)

    const textByPage: string[] = []
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const pdfPage = await pdfDocument.getPage(pageNumber)
      const text = await pdfPage.getTextContent()
      textByPage.push(text.items.map(item => 'str' in item ? item.str : '').join(' '))
    }
    const allText = textByPage.join(' ')
    const compactText = (value: string) => value.replace(/\s+/g, '')
    expect(compactText(allText)).toContain('Executivesummary')
    expect(compactText(allText)).toContain('FINALAUDIENCESECTION')
    expect(textByPage.filter(text => compactText(text).includes('Campaign')).length).toBeGreaterThan(1)
  }, 30_000)

  it('reflows the fixed dashboard shell into a complete multi-page report', async () => {
    try {
      browser = await chromium.launch({ headless: true })
    } catch (error) {
      if (!String(error).includes('Executable doesn\'t exist')) throw error
      browser = await chromium.launch({ channel: 'chrome', headless: true })
    }

    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
    const cards = Array.from({ length: 12 }, (_, index) => `
      <section class="rounded-lg report-card">Report section ${index + 1}</section>
    `).join('')

    await page.setContent(`
      <!doctype html>
      <style>
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; margin: 0; font-family: sans-serif; }
        [data-dashboard-shell] { position: fixed; inset: 0; display: flex; overflow: hidden; }
        [data-dashboard-content] { flex: 1 1 0%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; }
        aside { width: 18rem; flex: none; }
        .report { padding: 24px; }
        .report-card { height: 170px; margin: 12px 0; padding: 20px; border: 1px solid #999; }
        @media print { aside { display: none; } }
        ${printStyles}
      </style>
      <div data-dashboard-shell class="${shellClasses}">
        <aside>Navigation</aside>
        <main data-dashboard-content class="${contentClasses}">
          <div class="report">
            <h1>Portal analytics report</h1>
            ${cards}
            <p>FINAL REPORT SECTION</p>
          </div>
        </main>
      </div>
    `)
    await page.emulateMedia({ media: 'print' })

    const layout = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('[data-dashboard-shell]')!
      const content = document.querySelector<HTMLElement>('[data-dashboard-content]')!
      return {
        shellPosition: getComputedStyle(shell).position,
        shellOverflow: getComputedStyle(shell).overflow,
        contentDisplay: getComputedStyle(content).display,
        contentOverflow: getComputedStyle(content).overflow
      }
    })

    expect(layout).toEqual({
      shellPosition: 'static',
      shellOverflow: 'visible',
      contentDisplay: 'block',
      contentOverflow: 'visible'
    })

    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true })
    const pdfDocument = await getDocument({ data: new Uint8Array(pdf) }).promise
    const textByPage: string[] = []
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const pdfPage = await pdfDocument.getPage(pageNumber)
      const text = await pdfPage.getTextContent()
      textByPage.push(text.items.map(item => 'str' in item ? item.str : '').join(' '))
    }

    expect(pdfDocument.numPages).toBeGreaterThan(1)
    expect(textByPage.join(' ')).toContain('FINAL REPORT SECTION')
  }, 30_000)

  it('makes the multi-page analytics columns fragmentable in print', async () => {
    try {
      browser = await chromium.launch({ headless: true })
    } catch (error) {
      if (!String(error).includes('Executable doesn\'t exist')) throw error
      browser = await chromium.launch({ channel: 'chrome', headless: true })
    }

    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
    const reportCards = Array.from({ length: 6 }, (_, index) => `
      <section class="rounded-lg report-card">Report card ${index + 1}</section>
    `).join('')

    await page.setContent(`
      <!doctype html>
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; font-family: sans-serif; }
        .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
        .report-card { min-height: 160px; margin-bottom: 24px; padding: 20px; border: 1px solid #999; }
        ${printStyles}
      </style>
      <main data-report-grid class="${reportGridClasses}">
        <div data-report-column>${reportCards}</div>
        <div data-report-column>${reportCards}</div>
      </main>
    `)
    await page.emulateMedia({ media: 'print' })

    const printLayout = await page.evaluate(() => {
      const reportGrid = document.querySelector<HTMLElement>('[data-report-grid]')!
      const reportColumn = document.querySelector<HTMLElement>('[data-report-column]')!
      return {
        display: getComputedStyle(reportGrid).display,
        columnBreakInside: getComputedStyle(reportColumn).breakInside
      }
    })

    expect(printLayout).toEqual({
      display: 'block',
      columnBreakInside: 'auto'
    })
  }, 30_000)
})
