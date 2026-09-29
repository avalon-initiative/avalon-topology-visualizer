import { onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

export interface Size {
  width: number
  height: number
}

/** Used until the element has been measured (and wherever there is no layout, such as tests). */
export const INITIAL_SIZE: Size = { width: 720, height: 480 }

/** The content size of an element in CSS pixels, kept current by a ResizeObserver. Empty boxes are ignored. */
export function useElementSize(target: Ref<HTMLElement | null>, initial: Size = INITIAL_SIZE) {
  const size = shallowRef<Size>({ ...initial })
  let observer: ResizeObserver | undefined

  function apply(width: number, height: number) {
    const next = { width: Math.round(width), height: Math.round(height) }
    if (next.width <= 0 || next.height <= 0) return
    if (next.width !== size.value.width || next.height !== size.value.height) size.value = next
  }

  function stop() {
    observer?.disconnect()
    observer = undefined
  }

  watch(
    target,
    (el) => {
      stop()
      if (!el) return
      apply(el.clientWidth, el.clientHeight)
      if (typeof ResizeObserver === 'undefined') return
      observer = new ResizeObserver((entries) => {
        const box = entries[entries.length - 1]?.contentRect
        if (box) apply(box.width, box.height)
      })
      observer.observe(el)
    },
    { immediate: true, flush: 'post' },
  )
  onScopeDispose(stop)

  return { size }
}
