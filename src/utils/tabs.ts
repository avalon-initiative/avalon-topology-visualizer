export interface TabSpec<Id extends string> {
  id: Id
  disabled?: boolean
}

/** The id of the tab a key moves to (arrows wrap, Home/End jump), skipping disabled tabs; undefined for other keys. */
export function tabAfterKey<Id extends string>(tabs: TabSpec<Id>[], current: Id, key: string): Id | undefined {
  const enabled = tabs.filter((t) => !t.disabled || t.id === current)
  const at = enabled.findIndex((t) => t.id === current)
  if (at < 0) return undefined
  if (key === 'Home') return enabled[0].id
  if (key === 'End') return enabled[enabled.length - 1].id
  if (key === 'ArrowRight') return enabled[(at + 1) % enabled.length].id
  if (key === 'ArrowLeft') return enabled[(at - 1 + enabled.length) % enabled.length].id
  return undefined
}

export interface ToolTab<Id extends string> extends TabSpec<Id> {
  label: string
  /** A count or short state shown beside the label (text, so it never relies on colour). */
  badge?: string
}
