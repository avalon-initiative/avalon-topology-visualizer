import { computed, ref } from 'vue'
import { isPanned } from '../utils/pan'
import type { Point } from '../utils/layout'
import type { View } from '../utils/viewport'
import { canZoomIn, canZoomOut, clampZoom, isZoomed, zoomAt, zoomBase, zoomPercent, ZOOM_STEP } from '../utils/zoom'
import { usePanView } from './usePanView'
import type { PanSources } from './usePanView'

/**
 * The user's view transform over the auto-fitted view: a zoom (a multiple of the fit scale, about the stage centre)
 * and a pan on top. Both are kept across layout tweens, refreshes and drawer changes; the pan is clamped against the
 * zoomed view, so a node stays reachable at every zoom.
 */
export function useZoomView(s: PanSources) {
  const zoom = ref(1)
  const base = computed<View>(() => zoomBase(s.fitted(), zoom.value, s.size()))
  const panning = usePanView({ ...s, fitted: () => base.value })
  const centre = (): Point => ({ x: s.size().width / 2, y: s.size().height / 2 })

  function zoomBy(factor: number, at: Point = centre()) {
    const next = clampZoom(zoom.value * factor)
    if (next === zoom.value) return
    const pan = zoomAt(s.fitted(), s.size(), panning.pan.value, zoom.value, next, at)
    zoom.value = next
    // Re-clamped against the new zoom, so the graph cannot end up out of reach.
    panning.panTo(pan)
  }

  return {
    view: panning.view,
    pan: panning.pan,
    zoom: computed(() => zoom.value),
    percent: computed(() => zoomPercent(zoom.value)),
    panned: panning.panned,
    zoomed: computed(() => isZoomed(zoom.value)),
    /** Panned or zoomed: anything Reset view would undo. */
    moved: computed(() => isPanned(panning.pan.value) || isZoomed(zoom.value)),
    canZoomIn: computed(() => canZoomIn(zoom.value)),
    canZoomOut: computed(() => canZoomOut(zoom.value)),
    panBy: panning.panBy,
    zoomBy,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    reset() {
      zoom.value = 1
      panning.reset()
    },
  }
}
