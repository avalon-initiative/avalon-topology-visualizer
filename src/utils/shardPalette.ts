import { DEFAULT_THEME } from './drawGraph'

// Design tokens for the shard tints; none of these is the node colour, so a region never blends into a node.
const SHARD_TOKENS = ['--av-color-success', '--av-color-accent-tertiary', '--av-color-accent-secondary', '--av-color-warning', '--av-color-danger', '--av-color-primary-text']

export function readShardPalette(pick: (token: string, fallback: string) => string): string[] {
  return SHARD_TOKENS.map((t, i) => pick(t, DEFAULT_THEME.shardPalette[i]))
}
