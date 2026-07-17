export function updateStringSelection(current: readonly string[], value: string, selected: boolean): string[] {
  if (selected) return current.includes(value) ? [...current] : [...current, value]
  return current.filter(item => item !== value)
}
