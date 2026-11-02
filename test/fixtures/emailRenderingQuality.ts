export function renderingQualityDocument() {
  return {
    root: { type: 'EmailLayout', data: { props: { contentWidth: 700, darkMode: true, darkBackdropColor: '#101820', darkCanvasColor: '#182430', darkTextColor: '#f2f4f8' }, childrenIds: ['columns'] } },
    columns: { type: 'ColumnsContainer', data: { props: { reverseStacking: true, columns: [{ childrenIds: ['logo'] }, { childrenIds: ['button'] }] } } },
    logo: { type: 'Image', data: { props: { url: 'https://assets.example/light.png?a=1&b=2', darkSrc: 'https://assets.example/dark.png?a=1&b=2', alt: 'Logo & partners', linkHref: 'https://example.com/?a=1&b=2' } } },
    button: { type: 'Button', data: { props: { text: 'Hello {{ name|friend }} & team', url: 'https://example.com/?name={{name}}&x=1', outlookVml: true, outlookWidth: 220, buttonBackgroundColor: '#234567', buttonTextColor: '#ffffff' } } }
  }
}
