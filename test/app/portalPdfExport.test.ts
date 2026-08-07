import { readFileSync } from 'node:fs'
import { chromium, type Browser } from 'playwright'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it } from 'vitest'

const layoutSource = readFileSync('app/layouts/portal.vue', 'utf8')
const analyticsSource = readFileSync('app/pages/portal/analytics/index.vue', 'utf8')

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

let browser: Browser | undefined

afterEach(async () => {
  await browser?.close()
  browser = undefined
})

describe('portal analytics PDF export', () => {
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
