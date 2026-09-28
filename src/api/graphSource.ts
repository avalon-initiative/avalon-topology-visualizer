import { walkTopology } from '@avalon-initiative/protocol-sdk'
import type { TopologyGraph } from '@avalon-initiative/protocol-sdk'
import type { Snapshot } from '../utils/snapshot'

export interface WalkLimits {
  maxNodes?: number
  maxDepth?: number
  requestTimeoutMs?: number
}

export interface WalkProgress {
  discovered: number
  visited: number
}

/** One interface for both data modes: a live walk and a saved snapshot. */
export interface GraphSource {
  readonly live: boolean
  /** When the data was captured, if the source knows (a snapshot does; a live walk is "now"). */
  readonly takenAt?: Date
  load(signal: AbortSignal, onProgress: (progress: WalkProgress) => void): Promise<TopologyGraph>
}

export function liveWalkSource(seeds: string[], limits: WalkLimits = {}): GraphSource {
  return {
    live: true,
    load(signal, onProgress) {
      const progress: WalkProgress = { discovered: 0, visited: 0 }
      return walkTopology(seeds, {
        ...limits,
        signal,
        onProgress(event) {
          if (event.type === 'discovered') progress.discovered++
          else progress.visited++
          onProgress({ ...progress })
        },
      })
    },
  }
}

export function snapshotSource(snapshot: Snapshot): GraphSource {
  return { live: false, takenAt: new Date(snapshot.takenAt), load: async () => snapshot.graph }
}
