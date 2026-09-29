/** `system` follows the OS setting; the other two are the viewer's manual choice. */
export type MotionPreference = 'system' | 'reduce' | 'full'

export function reducedMotion(preference: MotionPreference, systemPrefersReduced: boolean): boolean {
  return preference === 'system' ? systemPrefersReduced : preference === 'reduce'
}

/** The preference after the viewer flips the toggle: always an explicit choice, opposite to what is in effect. */
export function toggledPreference(preference: MotionPreference, systemPrefersReduced: boolean): MotionPreference {
  return reducedMotion(preference, systemPrefersReduced) ? 'full' : 'reduce'
}
