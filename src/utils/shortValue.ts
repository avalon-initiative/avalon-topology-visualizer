/** Shortens a long identifier with a middle ellipsis so a 64-character shard id fits a chip or a row. */
export function shortValue(value: string, max = 28): string {
  if (max < 5 || value.length <= max) return value
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}
