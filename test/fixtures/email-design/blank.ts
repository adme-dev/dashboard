import { createEmptyDocument } from '../../../app/types/edm'

export function nonBlankBodies(): Array<[string, unknown]> {
  const change = (mutate: (body: ReturnType<typeof createEmptyDocument>) => void) => {
    const body = createEmptyDocument()
    mutate(body)
    return body
  }
  return [
    ...[null, undefined, '', 'null', '{}', [], {}, 0].map(value => [`malformed ${String(value)}`, value] as [string, unknown]),
    ['serialized exact blank', JSON.stringify(createEmptyDocument())],
    ['extra block', change(body => { body.hidden = { type: 'Html', data: { props: { contents: '<p>hidden</p>' } } } })],
    ['real Html child', change(body => { body.root.data.childrenIds = ['html']; body.html = { type: 'Html', data: { props: { contents: '<p>real</p>' } } } })],
    ...['importReceipt', 'sourceProvenance', 'hiddenHtml'].flatMap(key => [
      [`root ${key}`, change(body => { Object.assign(body.root, { [key]: '<p>hidden</p>' }) })],
      [`data ${key}`, change(body => { Object.assign(body.root.data, { [key]: { type: 'Html', contents: '<p>hidden</p>' } }) })],
      [`props ${key}`, change(body => { body.root.data.props![key] = '<p>hidden</p>' })]
    ] as Array<[string, unknown]>),
    ['contentWidth', change(body => { body.root.data.props!.contentWidth = 600 })],
    ...Object.keys(createEmptyDocument().root.data.props!).flatMap(key => [
      [`changed ${key}`, change(body => { body.root.data.props![key] = 'changed' })],
      [`wrong type ${key}`, change(body => { body.root.data.props![key] = null })],
      [`missing ${key}`, change(body => { delete body.root.data.props![key] })]
    ] as Array<[string, unknown]>),
    ['wrong root type', change(body => { body.root.type = 'Html' })],
    ['wrong children type', change(body => { body.root.data.childrenIds = {} as string[] })],
    ['extra data style', change(body => { body.root.data.style = {} })]
  ]
}
