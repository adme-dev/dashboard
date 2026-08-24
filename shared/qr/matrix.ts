import QRCode from 'qrcode'

export type EcLevel = 'L' | 'M' | 'Q' | 'H'
export interface QrMatrix { size: number, get(r: number, c: number): boolean }

export function buildMatrix(text: string, ec: EcLevel): QrMatrix {
  const q = QRCode.create(text, { errorCorrectionLevel: ec })
  const size = q.modules.size
  const data = q.modules.data as Uint8Array
  return { size, get: (r, c) => r >= 0 && c >= 0 && r < size && c < size && data[r * size + c] === 1 }
}
