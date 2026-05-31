// lib/flyhub-stub.ts
// Server/Workers stub for the @flyhub/* editor packages. They are CLIENT-ONLY
// (the visual builder runs in the browser). The server renders email HTML via
// the pure-TS pipeline in server/utils/email-marketing/render (no @flyhub dep),
// so the heavy builder packages must never enter the Nitro/Workers bundle.
export default {}
export const Reader = () => null
export function renderToStaticMarkup(): string {
  return ''
}
