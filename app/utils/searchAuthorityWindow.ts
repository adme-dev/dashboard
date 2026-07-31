interface SearchAuthorityDateWindow {
  startDate: string
  endDate: string
}

export function normalizeSearchAuthorityWindow(
  startDate: string,
  endDate: string,
  fallback: SearchAuthorityDateWindow
): SearchAuthorityDateWindow {
  if (!startDate || !endDate) return { ...fallback }
  return { startDate, endDate }
}
