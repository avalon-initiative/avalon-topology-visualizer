import type { WalkFailure } from '@avalon-initiative/protocol-sdk'

export function describeFailure(f: WalkFailure): string {
  switch (f.reason) {
    case 'timeout':
      return 'No response in time'
    case 'rate_limited':
      return f.retryAfterSeconds === undefined ? 'Rate limited' : `Rate limited, retry after ${f.retryAfterSeconds}s`
    case 'http_status':
      return `HTTP ${f.status ?? 'error'}`
    case 'protocol_error':
      return 'Unexpected response'
    default:
      return 'Could not connect'
  }
}
