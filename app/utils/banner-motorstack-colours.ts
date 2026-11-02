export interface MotorStackNamedImage {
  name: string
  mime: string
  importable: boolean
}

/** MotorStack media names retain the source path: model · grade · paint · photos N. */
export function motorStackPaintName(name: string): string | null {
  const parts = name.split('·').map(part => part.trim()).filter(Boolean)
  if (parts.length < 3) return null
  const last = parts.at(-1)!
  const paint = /^(?:interior_)?(?:photos|gallery|images)\s+\d+$/i.test(last) ? parts.at(-2)! : last
  return paint && !/^(?:interior_)?(?:photos|gallery|images)\s+\d+$/i.test(paint) ? paint : null
}

export function motorStackPaintNames(images: MotorStackNamedImage[]): string[] {
  return [...new Map(images.filter(image => image.importable && image.mime.startsWith('image/'))
    .map(image => motorStackPaintName(image.name))
    .filter((paint): paint is string => !!paint)
    .map(paint => [paint.toLocaleLowerCase(), paint])).values()].sort((a, b) => a.localeCompare(b))
}

export function matchesMotorStackPaint(image: MotorStackNamedImage, paint: string): boolean {
  if (paint === '__all_colours__') return true
  if (paint === '__other_images__') return !motorStackPaintName(image.name)
  return motorStackPaintName(image.name)?.toLocaleLowerCase() === paint.toLocaleLowerCase()
}
