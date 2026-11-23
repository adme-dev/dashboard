export interface MotorStackNamedImage {
  name: string
  mime: string
  importable: boolean
}

/** MotorStack media names retain the source path: model · grade · paint · photos N. */
function vehicleParts(name: string): string[] {
  const parts = name.split('·').map(part => part.trim()).filter(Boolean)
  if (/^(?:interior_)?(?:photos|gallery|images)\s+\d+$/i.test(parts.at(-1) || '')) parts.pop()
  return parts.length >= 3 ? parts : []
}

export function motorStackPaintName(name: string): string | null {
  return vehicleParts(name).at(-1) || null
}

export function motorStackGradeName(name: string): string | null {
  return vehicleParts(name).at(-2) || null
}

export function motorStackGradeNames(images: MotorStackNamedImage[]): string[] {
  return [...new Map(images.filter(image => image.importable && image.mime.startsWith('image/'))
    .map(image => motorStackGradeName(image.name))
    .filter((grade): grade is string => !!grade)
    .map(grade => [grade.toLocaleLowerCase(), grade])).values()].sort((a, b) => a.localeCompare(b))
}

export function matchesMotorStackGrade(image: MotorStackNamedImage, grade: string): boolean {
  return grade === '__all_grades__' || motorStackGradeName(image.name)?.toLocaleLowerCase() === grade.toLocaleLowerCase()
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
