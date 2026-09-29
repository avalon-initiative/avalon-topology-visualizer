/** Viewports at least this wide (CSS px) get the tools as a side panel; narrower ones get them as a bottom sheet. */
export const SIDE_PANEL_MIN_PX = 768

/** True when the tools should start open: wide screens only. Without matchMedia (tests) counts as wide. */
export function isWideViewport(match: (query: string) => { matches: boolean } | undefined = (q) => globalThis.matchMedia?.(q)) {
  return match(`(min-width: ${SIDE_PANEL_MIN_PX}px)`)?.matches ?? true
}
