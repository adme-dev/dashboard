import { starterEmailTemplate } from '../../shared/pageStudio/emailTemplates'

const text = { type: 'Text', data: { props: { text: 'Hello & goodbye — Melbourne' } } }
export const documentFixtures = [
  { name: 'empty', document: { root: { type: 'EmailLayout', data: { childrenIds: [] } } }, options: {} },
  { name: 'content', document: {
    root: { type: 'EmailLayout', data: { childrenIds: ['heading', 'text', 'button'] } },
    heading: { type: 'Heading', data: { props: { level: 'h2', text: 'Title <safe>' } } }, text,
    button: { type: 'Button', data: { props: { text: 'Continue', url: 'https://example.invalid/path?a=1&b=2' } } }
  }, options: { subjectLine: 'A subject', previewText: 'A preview', variables: { first_name: 'Ari' } } },
  { name: 'nested', document: {
    root: { type: 'EmailLayout', data: { childrenIds: ['columns'] } },
    columns: { type: 'ColumnsContainer', data: { props: { columns: [{ childrenIds: ['box'] }, { childrenIds: ['text'] }] } } },
    box: { type: 'Container', data: { childrenIds: ['text', 'missing'], style: { padding: { top: 8, left: 8, right: 8, bottom: 8 } } } }, text
  }, options: {} },
  { name: 'html-and-unknown', document: {
    root: { type: 'EmailLayout', data: { childrenIds: ['html', 'unknown'] } },
    html: { type: 'Html', data: { props: { contents: '<p><strong>Rich HTML</strong> {{first_name}}</p>' } } },
    unknown: { type: 'FutureBlock', data: {} }
  }, options: { variables: { first_name: 'Ari & Team' } } },
  { name: 'responsive', document: {
    root: { type: 'EmailLayout', data: { props: { fontFamily: 'BOOK_SERIF' }, childrenIds: ['text'] } },
    text: { type: 'Text', data: { props: { text: 'Responsive text', anchorId: 'details' }, style: { color: '#123456', fontSize: 20 }, mobile: { style: { fontSize: 14 } } } }
  }, options: {} }
]
const template = starterEmailTemplate('team')
export const customerFixture = {
  template: { ...template, blocks: [...template.blocks, { id: 'photo', type: 'image' as const, assetId: '10000000-0000-4000-8000-000000000001', alt: 'Sample image', width: 200, alignment: 'center' as const }] },
  context: { siteName: 'Sample & Co', formName: 'Contact <sales>', fields: [{ id: 'name', name: 'Your name', type: 'text' }, { id: 'hidden', name: 'Private tracking', type: 'hidden' }], images: { '10000000-0000-4000-8000-000000000001': 'data:image/png;base64,aGVsbG8=' } }
}
