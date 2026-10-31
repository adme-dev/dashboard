/** Imported faces are reused by bytes and scope, never by family name alone. */
export interface ImportedFontFace {
  id: string
  name: string
  tags: string[]
  clientId?: string | null
  sha256?: string | null
}

export interface PreparedFontIdentity {
  family: string
  weight: number
  sha256: string
}

export function findImportedFontFace<T extends ImportedFontFace>(faces: T[], font: PreparedFontIdentity, clientId: string): T | undefined {
  const matches = faces.filter(face => face.name === font.family
    && face.sha256 === font.sha256
    && face.tags.includes('font')
    && face.tags.includes(`weight:${font.weight}`)
    && (face.clientId === clientId || face.clientId === null))
  return matches.find(face => face.clientId === clientId) || matches.find(face => face.clientId === null)
}

export function bindImportedFontFace(
  boards: Record<string, { layers: Array<{ fontFamily?: string, fontWeight?: number, fontAssetId?: string }> }>,
  font: PreparedFontIdentity,
  face: ImportedFontFace,
  clientId: string
) {
  if (!findImportedFontFace([face], font, clientId)) throw new Error('Stored font differs from the prepared package or client scope')
  for (const board of Object.values(boards)) {
    for (const layer of board.layers) {
      if (layer.fontFamily === font.family && (layer.fontWeight ?? 400) === font.weight) layer.fontAssetId = face.id
    }
  }
}
