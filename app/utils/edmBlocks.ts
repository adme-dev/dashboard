// app/utils/edmBlocks.ts
// Shared block palette + per-type default block data for the EDM editor canvas.
// Pure data + logic (no Vue imports) so it stays unit-testable and is the single
// source of truth shared by the palette, insert zones, container, and columns.

export interface EdmPaletteItem {
  type: string
  name: string
  icon: string // iconify lucide name, e.g. 'i-lucide-type'
}

// The 10 block types the agency email editor supports. Dynamic/template/
// transactional automotive blocks from the source project are intentionally absent.
export const BLOCK_PALETTE: EdmPaletteItem[] = [
  { type: 'Heading', name: 'Heading', icon: 'i-lucide-heading' },
  { type: 'Text', name: 'Text', icon: 'i-lucide-type' },
  { type: 'Button', name: 'Button', icon: 'i-lucide-mouse-pointer-click' },
  { type: 'Image', name: 'Image', icon: 'i-lucide-image' },
  { type: 'Avatar', name: 'Avatar', icon: 'i-lucide-user' },
  { type: 'Divider', name: 'Divider', icon: 'i-lucide-minus' },
  { type: 'Spacer', name: 'Spacer', icon: 'i-lucide-move-vertical' },
  { type: 'Html', name: 'HTML', icon: 'i-lucide-code' },
  { type: 'ColumnsContainer', name: 'Columns', icon: 'i-lucide-columns-3' },
  { type: 'Container', name: 'Container', icon: 'i-lucide-square' }
]

function getDefaultProps(type: string): Record<string, unknown> {
  switch (type) {
    case 'Heading':
      return { text: 'New Heading', level: 'h2' }
    case 'Text':
      return { text: 'Enter your text here...' }
    case 'Button':
      return { text: 'Click Here', url: '#', buttonBackgroundColor: '#2f4574' }
    case 'Image':
      return { url: 'https://placehold.co/600x400/f5f5f5/ccc?text=Your+Image', alt: 'Image' }
    case 'Spacer':
      return { height: 24 }
    case 'Divider':
      return { lineColor: '#e5e7eb' }
    case 'Html':
      return { contents: '<p>Custom HTML content</p>' }
    case 'ColumnsContainer':
      return {
        columnsCount: 2,
        columnsGap: 16,
        contentAlignment: 'top',
        columns: [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }]
      }
    default:
      return {}
  }
}

// Default `data` payload for a newly-added block, ready to pass to store.addBlock.
export function getDefaultBlockData(type: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    style: { padding: { top: 16, bottom: 16, left: 24, right: 24 } },
    props: getDefaultProps(type)
  }
  if (type === 'Container' || type === 'ColumnsContainer') {
    data.childrenIds = []
  }
  return data
}
