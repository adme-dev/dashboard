import JSZip from 'jszip'
import * as XLSX from 'xlsx'

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function pdfEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
}

export function createPdfFixture(pageTexts: string[]): Buffer {
  const pageCount = Math.max(1, pageTexts.length)
  const fontObjectId = 3 + pageCount * 2
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`
  ]

  for (let index = 0; index < pageCount; index++) {
    const contentObjectId = 4 + index * 2
    const content = pageTexts[index]
      ? `BT /F1 12 Tf 72 720 Td (${pdfEscape(pageTexts[index] || '')}) Tj ET`
      : ''
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`)
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`)
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'ascii')
}

export function createXlsxFixture(rows: unknown[][], sheetName = 'Weekly forecast'): Buffer {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName)
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer
}

export async function createDocxFixture(
  paragraphs: string[],
  options: { entityDeclaration?: string } = {}
): Promise<Buffer> {
  const zip = new JSZip()
  const body = paragraphs
    .map(paragraph => `<w:p><w:r><w:t>${xmlEscape(paragraph)}</w:t></w:r></w:p>`)
    .join('')
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  zip.file('word/document.xml', `${options.entityDeclaration || ''}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

export async function createPptxFixture(slides: string[]): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  slides.forEach((slide, index) => {
    zip.file(`ppt/slides/slide${index + 1}.xml`, `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:p><a:r><a:t>${xmlEscape(slide)}</a:t></a:r></a:p></p:cSld></p:sld>`)
  })
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

export async function createOversizedDocxFixture(uncompressedCharacters: number): Promise<Buffer> {
  return createDocxFixture(['X'.repeat(uncompressedCharacters)])
}

export function createCorruptZipFixture(): Buffer {
  return Buffer.from('PK\u0003\u0004not-a-valid-zip', 'binary')
}
